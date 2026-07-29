/**
 * 决定性：用管线 cd 静态 keys 反解 jsdom 生成的 cookie。
 * - 若能解出合法 basearr → jsdom 密钥 == 管线 cd 静态 keys → 管线密钥已对（30% 是别的原因）
 * - 若乱码 → jsdom 密钥 != 管线 keys → 印证密钥由动态代码生成，管线 cd 静态 keys 错
 *
 * 同时看 jsdom cookie 的 [0] 段指纹（与真实浏览器 [0] 段对比）。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=...kimi/node_modules node test_jsdom_decrypt.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');
const { JSDOM } = require('jsdom');
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

function httpGet(url, cookie) {
  return new Promise(r => {
    const h = { 'User-Agent': UA };
    if (cookie) h['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers: h }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '', headers: {} }));
  });
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
const _ec = getEncryptConfig(getTree());
const _cm = {};
for (let b = 0; b < 256; b++) { const c = _ec[0][b]; if (!c) continue; if (!_cm[c.val]) _cm[c.val] = {}; _cm[c.val][c.key] = b; }
function numarrDecrypt(numarr) {
  const ans = []; let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) { const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) { const b = (byte >> bit) & 1; curKey = (curKey << 1) | b; curLen++;
      const mm = _cm[curLen]; if (mm && mm[curKey] !== undefined) { ans.push(mm[curKey]); curKey = 0; curLen = 0; } } }
  return ans;
}
const ol = console.log; console.log = () => {};

(async () => {
  // 1. jsdom 生成 cookie（同 cd）
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oC = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: TARGET, userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  const cw = []; let cj = oC || '';
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cw.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  window.eval(outerJsCode);
  await new Promise(r => setTimeout(r, 2500));
  const jsdomPC = cw.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  window.close();
  console.log = ol;
  if (!jsdomPC) { console.log('jsdom 未生成 P'); process.exit(1); }
  const jsdomPVal = jsdomPC.split('=')[1];
  console.log(`jsdom P len=${jsdomPVal.length}（同 cd nsd=${ts.nsd}）`);

  // 2. 管线 keys（同 cd）反解 jsdom cookie
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require('./utils/paths').package));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const parser = require('@src/handler/parser/');
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd: ts.nsd, cd: ts.cd }, outerJsCode);
  const tsFull = { nsd: ts.nsd, cd: ts.cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/t.json', JSON.stringify(tsFull));
  const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', tsFull);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
  const runRet = coder.run();
  runRet.$_ts.cp[3] = r.cp3;
  gv.config.codemap = runRet.codemap;
  new Cookie(coder).run();

  const { encryptMode2, xor, numToNumarr4, uuid } = parser;
  const payload = jsdomPVal.startsWith('0') ? jsdomPVal.slice(1) : jsdomPVal;
  const idxmap = {}; gv.basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const bytes = [];
  for (let g = 0; g * 4 < payload.length - 3; g++) {
    const c0 = idxmap[payload[g*4]], c1 = idxmap[payload[g*4+1]], c2 = idxmap[payload[g*4+2]], c3 = idxmap[payload[g*4+3]];
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  console.log(`解码字节数=${bytes.length}`);
  try {
    const dec = encryptMode2(bytes, gv.keys[16], 1);
    const nextarr = dec.slice(4);
    const headOk = nextarr[0] === 2 && nextarr[1] === 8;
    console.log(`外层解密: nextarr head=${nextarr.slice(0, 4).join(',')} (headOk=${headOk})`);
    let idx = 2; idx += 8;
    const keys2len = nextarr[idx]; idx++; idx += keys2len;
    let rest = nextarr.slice(idx);
    let basearrEncrypt;
    if ((rest[0] & 0x80) === 0x80) { const encLen = rest[1] | ((rest[0] & 0x7f) << 8); basearrEncrypt = rest.slice(2, 2 + encLen); }
    else { const encLen = rest[0]; basearrEncrypt = rest.slice(1, 1 + encLen); }
    const dec2 = encryptMode2([...basearrEncrypt], gv.keys[17], 0);
    const numenc = xor([...dec2], gv.keys[2], 16);
    const basearr = numarrDecrypt(numenc);
    console.log(`内层解密: basearr len=${basearr.length} head=${basearr.slice(0, 6).join(',')}`);
    const valid = basearr[0] === 3 && basearr[1] === 73;
    console.log(valid ? `✓ 反解成功 → jsdom 密钥 == 管线 cd 静态 keys → 管线密钥已对!` : `✗ 乱码 → jsdom 密钥 != 管线 keys`);
    if (valid) {
      // [0] 段定位与对比
      let seg0Start = -1;
      for (let j = 60; j < basearr.length - 2; j++) { if (basearr[j] === 0 && basearr[j + 1] === 101) { seg0Start = j + 2; break; } }
      if (seg0Start < 0) for (let j = 60; j < basearr.length - 2; j++) { if (basearr[j] === 0 && basearr[j + 1] > 50 && basearr[j + 1] < 120) { seg0Start = j + 2; break; } }
      console.log(`[0] 段起点=${seg0Start}, 前 16 字节: ${seg0Start >= 0 ? basearr.slice(seg0Start, seg0Start + 16).join(',') : 'N/A'}`);
      console.log(`basearr 全长=${basearr.length}（真实浏览器 244/247）`);
      fs.writeFileSync('/tmp/jsdom_basearr.json', JSON.stringify({ basearr, seg0Start }));
    }
  } catch (e) { console.log('反解失败:', e.message, '→ jsdom 密钥 != 管线 keys（印证密钥动态生成）'); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
