/**
 * 决定性实验：管线 [0] 段替换为当前真实浏览器的 [0] 段（seg0Override 注入），
 * 测通过率是否 → 100%。
 * - 若 100% → [0] 明文指纹是根因，且服务端不校验 [0] vs 请求指纹一致性 → 可硬编码
 * - 若仍 ~30% → [0] 与根因无关
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_seg0_inject.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
const REAL_SEG0 = JSON.parse(fs.readFileSync('/tmp/real_seg0.json', 'utf8'));

let _got = null;
async function gotScraping() {
  if (!_got) {
    const { gotScraping } = await import('got-scraping');
    _got = gotScraping.extend({
      headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 131, maxVersion: 131 }], devices: ['desktop'], operatingSystems: ['macos'] },
      https: { rejectUnauthorized: false }, timeout: { request: 15000 }, retry: { limit: 0 }, throwHttpErrors: false,
    });
  }
  return _got;
}
async function httpGet(url, cookie) {
  const g = await gotScraping();
  const headers = { 'User-Agent': UA };
  if (cookie) headers['Cookie'] = cookie;
  const res = await g.get(url, { headers });
  return { status: res.statusCode, headers: res.headers, body: res.body };
}

async function tryOnce(injectSeg0) {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('no ts');
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  if (injectSeg0) gv._setAttr('makecookieRuntimeConfig', { seg0Override: REAL_SEG0 });
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);
  return replay.status;
}

(async () => {
  const N = parseInt(process.argv[2] || '15', 10);
  console.log('=== A: 注入真实 [0] 段 ===');
  let okA = 0;
  for (let i = 0; i < N; i++) {
    try { const s = await tryOnce(true); if (s === 200) okA++; console.log(`#${i + 1}: ${s}`); }
    catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 40)}`); }
  }
  console.log(`注入真实 [0]: ${okA}/${N} 通过 (${(okA / N * 100).toFixed(1)}%)`);

  console.log('\n=== B: 对照（管线默认 [0]）===');
  let okB = 0;
  for (let i = 0; i < N; i++) {
    try { const s = await tryOnce(false); if (s === 200) okB++; console.log(`#${i + 1}: ${s}`); }
    catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 40)}`); }
  }
  console.log(`默认 [0]: ${okB}/${N} 通过 (${(okB / N * 100).toFixed(1)}%)`);
  console.log(`\n结论: ${okA >= N * 0.9 ? '注入真实[0]→~100%，[0]明文指纹是根因，可硬编码' : okA > okB ? '注入真实[0]有提升但未100%' : '注入真实[0]无提升，[0]非根因'}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
