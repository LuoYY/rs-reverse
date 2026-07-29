/**
 * dump 一个 cookie 的完整加密中间产物，并逐层手动验证可逆性。
 * 找到 412-cd 外层 uuidOk=false 的不可逆根源。
 *
 * 复现 Cookie.run 的每一步，每步后立即逆转验证：
 *   basearr → numarrEncrypt → xor → enc1(keys17,flag=0) [逆: dec→xor→huffman→basearr]
 *   → nextarr → enc1(keys16,flag=1,IV) [逆: dec→nextarr]
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_step_reversibility.js [N]
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

  // huffman decode 准备
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

  // 捕获 basearr（hook numarrEncrypt）
  let basearr = null;
  const ciPath = require.resolve('@src/handler/parser/common/index.js');
  const oc = require(ciPath);
  const one = oc.numarrEncrypt;
  require.cache[ciPath].exports = new Proxy(oc, {
    get(t, p) { if (p === 'numarrEncrypt') return (n) => { if (!basearr) basearr = [...n]; return one(n); }; return t[p]; }
  });

  const config = { ...gv.makecookieRuntimeConfig };
  const ck = new Cookie(coder);
  // 手动复现 Cookie.run（用捕获的 basearr + 同 config）
  const cookie = ck.run();
  // ck.config 现在有 codeUid/r2mkaTime
  const cfg = ck.config;

  // ---- 手动复现加密链（用捕获的 basearr + ck.config）----
  const manEnc1 = encryptMode1(xor(numarrEncrypt(basearr), gv.keys[2], 16), numarrAddTime(gv.keys[17], cfg.runTime, cfg.random)[0], 0);
  const manNextarr = numarrJoin(numarrJoin(2, numToNumarr4([cfg.r2mkaTime, cfg.startTime]), gv.keys[2]), gv.config.adapt?.hasDebug ? manEnc1.length >> 8 & 255 | 128 : undefined, manEnc1);
  const manOuter = encryptMode1([...numToNumarr4(uuid(manNextarr)), ...manNextarr], numarrAddTime(gv.keys[16], cfg.runTime, cfg.random)[0], 1, cfg.random);
  const manCookie = (gv.config.adapt?.cookiePrefix || '0') + numarr2string(manOuter, gv.config.adapt?.basestr ? gv.config.adapt.basestr.split('') : undefined);

  // ---- 逐层可逆性验证 ----
  const rev = {};
  // 内层 keys17: enc1(flag=0) → dec → xor → huffman → basearr
  try {
    const d = encryptMode2([...manEnc1], gv.keys[17], 0);
    const ne = xor([...d], gv.keys[2], 16);
    const ba = numarrDecrypt(ne);
    rev.innerOk = JSON.stringify(ba) === JSON.stringify(basearr);
  } catch (e) { rev.innerOk = 'ERR:' + e.message; }
  // 外层 keys16: enc1(flag=1) → dec → [uuid, ...nextarr]
  try {
    const d = encryptMode2([...manOuter], gv.keys[16], 1);
    const na = d.slice(4);
    rev.outerOk = JSON.stringify(na) === JSON.stringify(manNextarr);
    rev.outerUuidOk = JSON.stringify(d.slice(0, 4)) === JSON.stringify(numToNumarr4(uuid(na)));
  } catch (e) { rev.outerOk = 'ERR:' + e.message; }
  rev.manCookieEqPipe = manCookie === cookie;

  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const replay = await httpGet(TARGET, `${oCookie}; ${name}=${cookie}`);
  return { status: replay.status, nsd, rev, cookieLen: cookie.length, manCookieLen: manCookie.length };
}

(async () => {
  const N = parseInt(process.argv[2] || '12', 10);
  for (let i = 0; i < N; i++) {
    try {
      const r = await tryOnce();
      console.log(`#${i + 1}: ${r.status} man==pipe:${r.rev.manCookieEqPipe} innerOk:${r.rev.innerOk} outerOk:${r.rev.outerOk} outerUuidOk:${r.rev.outerUuidOk} cookieLen:${r.cookieLen}/${r.manCookieLen}`);
    } catch (e) { console.log(`#${i + 1}: ERR ${String(e.message).substring(0, 50)}`); }
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
