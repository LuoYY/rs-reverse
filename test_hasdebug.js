/**
 * 验证 len243 hasDebug 标志对 cookie 结构与通过率的影响。
 * 真实瑞数（生产）可能 hasDebug=false，管线 len243 配 hasDebug=true。
 * 临时改 hasDebug=false（运行时覆盖 adapt），测 cookie 长度与通过率。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_hasdebug.js [N]
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

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

async function tryOnce(hasDebug) {
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
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  // 覆盖 adapt.hasDebug
  if (gv.config.adapt) gv.config.adapt.hasDebug = hasDebug;
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug, ...ts }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);
  return { status: replay.status, cookieLen: cookie.length };
}

(async () => {
  const N = parseInt(process.argv[2] || '15', 10);
  console.log('=== A: hasDebug=true（当前默认）===');
  let okA = 0; const lensA = [];
  for (let i = 0; i < N; i++) {
    try { const r = await tryOnce(true); lensA.push(r.cookieLen); if (r.status === 200) okA++; process.stdout.write(r.status === 200 ? '✓' : '·'); }
    catch (e) { process.stdout.write('E'); }
  }
  console.log(`\nhasDebug=true: ${okA}/${N} cookieLen=${[...new Set(lensA)]}`);

  console.log('\n=== B: hasDebug=false ===');
  let okB = 0; const lensB = [];
  for (let i = 0; i < N; i++) {
    try { const r = await tryOnce(false); lensB.push(r.cookieLen); if (r.status === 200) okB++; process.stdout.write(r.status === 200 ? '✓' : '·'); }
    catch (e) { process.stdout.write('E'); }
  }
  console.log(`\nhasDebug=false: ${okB}/${N} cookieLen=${[...new Set(lensB)]}`);
  console.log(`\n结论: hasDebug=false ${okB > okA ? '提升' : okB === okA ? '无差异' : '降低'}${okB >= N * 0.9 ? ' → ~100% 根因是 hasDebug！' : ''}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
