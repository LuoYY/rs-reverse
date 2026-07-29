/**
 * 对比 200-cd 与 412-cd 的 keys[16]/[17]/[2] 长度与 numarrAddTime 后 %16。
 * keys 长度影响 numarrAddTime(keys, time) 后数组长度（len+4+1），
 * 进而影响 encryptMode1 的 getCfg（combine4(len/4)）与 max/fill。
 * 若 412-cd 的 keys 长度导致加密结构异常 → 根因定位。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_keys_length.js [N]
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

async function tryOnce() {
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
  return {
    status: replay.status, nsd,
    k2len: gv.keys[2].length, k16len: gv.keys[16].length, k17len: gv.keys[17].length,
    // numarrAddTime 后长度 = keylen + 4(time) + 1(ele) = keylen+5，对 getCfg combine4 需 /4 整数
    k16mod: (gv.keys[16].length + 5) % 16, k17mod: (gv.keys[17].length + 5) % 16,
    cookieLen: cookie.length,
  };
}

(async () => {
  const N = parseInt(process.argv[2] || '20', 10);
  const rows = [];
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      rows.push(r);
      console.log(`#${i + 1}: ${r.status} k2=${r.k2len} k16=${r.k16len}(mod${r.k16mod}) k17=${r.k17len}(mod${r.k17mod}) cookieLen=${r.cookieLen}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 40)}`); }
  }
  const ok = rows.filter(r => r.status === 200), bad = rows.filter(r => r.status !== 200);
  console.log(`\n===== ${ok.length}/${rows.length} 通过 =====`);
  console.log('200 组 k16len:', ok.map(r => r.k16len), 'k17len:', ok.map(r => r.k17len), 'k2len:', ok.map(r => r.k2len));
  console.log('412 组 k16len:', bad.map(r => r.k16len), 'k17len:', bad.map(r => r.k17len), 'k2len:', bad.map(r => r.k2len));
  console.log('200 组 cookieLen:', [...new Set(ok.map(r => r.cookieLen))]);
  console.log('412 组 cookieLen:', [...new Set(bad.map(r => r.cookieLen))]);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
