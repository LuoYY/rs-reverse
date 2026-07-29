/**
 * hook 412-cd 的 Cookie.run() 全过程中间产物，对比 200-cd，定位异常步骤。
 * 捕获：basearr → numarrEncrypt → xor → encryptMode1(basearrEncrypt) → nextarr → encryptMode1(外层) → cookie
 * 对每步做自洽校验（能否逆转），找出 412-cd 哪步不可逆/异常。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_cookie_pipeline_trace.js [N]
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

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); }
  while (arr.length > 1) { const [o, t] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: o.total + t.total, first: o, second: t }); }
  return arr[0];
}
function getKey(arr) { for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; } }
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) { getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr); getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr); }
  else arr[tree.idx] = config;
  return [arr, getKey(arr)];
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
  const parser = require('@src/handler/parser/');
  const { encryptMode1, encryptMode2, numarrEncrypt, xor, numarrAddTime, numToNumarr4, uuid, numarr2string, numarrJoin } = parser;
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

  // ---- 用同 keys 逆向校验 cookie 的每一层 ----
  const ec = getEncryptConfig(getTree());
  const codeMap = {};
  for (let b = 0; b < 256; b++) { const c = ec[0][b]; if (!c) continue; if (!codeMap[c.val]) codeMap[c.val] = {}; codeMap[c.val][c.key] = b; }
  function numarrDecrypt(numarr) {
    const ans = []; let curLen = 0, curKey = 0;
    for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
      for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
        const mm = codeMap[curLen]; if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; } } }
    return ans;
  }
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
  const trace = {};
  try {
    const payload = cookie.startsWith('0') ? cookie.slice(1) : cookie;
    const bytes = numarr2stringDecode(payload);
    trace.bytesLen = bytes.length;
    // 外层解密 keys16
    const dec1 = encryptMode2(bytes, gv.keys[16], 1);
    trace.nextarrLen = dec1.length - 4;
    const uuidCheck = dec1.slice(0, 4);
    const nextarr = dec1.slice(4);
    trace.uuidOk = JSON.stringify(uuidCheck) === JSON.stringify(numToNumarr4(uuid(nextarr)));
    trace.nextarrHead = nextarr.slice(0, 4).join(',');
    // 解析 nextarr
    let idx = 2; idx += 8;
    const keys2len = nextarr[idx]; idx++;
    trace.keys2len = keys2len;
    const keys2 = nextarr.slice(idx, idx + keys2len); idx += keys2len;
    trace.keys2match = JSON.stringify(keys2) === JSON.stringify(gv.keys[2].slice(0, keys2len));
    let rest = nextarr.slice(idx);
    let basearrEncrypt;
    if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
    else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
    trace.basearrEncLen = basearrEncrypt.length;
    // 内层解密 keys17
    const dec2 = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
    trace.xorLen = dec2.length;
    const numenc = xor([...dec2], gv.keys[2], 16);
    const basearr = numarrDecrypt(numenc);
    trace.basearrLen = basearr.length;
    trace.basearrValid = basearr[0] === 3 && basearr[1] === 73 && basearr.length >= 200;
  } catch (e) { trace.err = e.message; }
  return { status: replay.status, nsd, trace };
}

(async () => {
  const N = parseInt(process.argv[2] || '16', 10);
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      const t = r.trace;
      console.log(`#${i + 1}: ${r.status} uuidOk=${t.uuidOk} keys2match=${t.keys2match} nextarrLen=${t.nextarrLen} baseEncLen=${t.basearrEncLen} baseLen=${t.basearrLen} valid=${t.basearrValid}${t.err ? ' ERR:' + t.err : ''}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 40)}`); }
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
