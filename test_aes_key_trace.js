/**
 * hook encryptMode1/encryptMode2 记录 keyarr 与 getCfg 内部 combine4 输入，
 * 对一个 412 cookie，对比【加密时的 AES key】与【反解时的 AES key】是否一致。
 * 若不一致 → 找到不可逆根源。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_aes_key_trace.js
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

(async () => {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.error('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || setCookies.map(c => c.split(';')[0])[0];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');

  // hook encryptMode1/encryptMode2 记录 keyarr
  const mePath = require.resolve('@src/handler/parser/common/modeEncrypt.js');
  const origMe = require(mePath);
  const encKeys = [];
  require.cache[mePath].exports = {
    ...origMe,
    encryptMode1: function (valarr, keyarr, flag, random) {
      encKeys.push({ type: 'enc', flag, keyLen: keyarr.length, keyHead: keyarr.slice(0, 4).join(','), valLen: valarr.length });
      return origMe.encryptMode1(valarr, keyarr, flag, random);
    },
    encryptMode2: function (valarr, keyarr, flag) {
      encKeys.push({ type: 'dec', flag, keyLen: keyarr.length, keyHead: keyarr.slice(0, 4).join(','), valLen: valarr.length });
      return origMe.encryptMode2(valarr, keyarr, flag);
    },
  };
  const parser = require('@src/handler/parser/');
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

  encKeys.length = 0;
  const cookie = new Cookie(coder).run();
  console.log('=== 加密时 encryptMode1 调用 ===');
  encKeys.forEach(k => console.log(`  ${k.type} flag=${k.flag} keyLen=${k.keyLen} keyHead=${k.keyHead} valLen=${k.valLen}`));
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);
  console.log(`重放: ${replay.status}`);

  // 反解
  console.log('\n=== 反解时 encryptMode2 调用 ===');
  encKeys.length = 0;
  function numarr2stringDecode(str) {
    const keys = gv.basestr.split(''); const idxmap = {};
    keys.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const numarr = []; let i = 0;
    const full = Math.floor(str.length / 4);
    for (let g = 0; g < full; g++) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]], c3 = idxmap[str[i+3]]; i += 4;
      numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3); }
    const rem = str.length - i;
    if (rem === 2) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]]; numarr.push((c0 << 2) | (c1 >> 4)); }
    else if (rem === 3) { const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]]; numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
    return numarr;
  }
  const { encryptMode2 } = parser;
  const payload = cookie.startsWith('0') ? cookie.slice(1) : cookie;
  const bytes = numarr2stringDecode(payload);
  const dec1 = encryptMode2(bytes, gv.keys[16], 1);
  encKeys.forEach(k => console.log(`  ${k.type} flag=${k.flag} keyLen=${k.keyLen} keyHead=${k.keyHead} valLen=${k.valLen}`));
  console.log('\n加密 keys16 派生 key vs 反解原始 keys16:');
  console.log('  gv.keys[16] len=' + gv.keys[16].length + ' head=' + gv.keys[16].slice(0, 4).join(','));
  console.log('  gv.keys[17] len=' + gv.keys[17].length + ' head=' + gv.keys[17].slice(0, 4).join(','));
  console.log('  dec1(nextarr+uuid) len=' + dec1.length);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
