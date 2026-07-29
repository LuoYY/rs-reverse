/**
 * 对比有无指纹 stub 的 jsdom cookie 长度（验证 stub 是否增加指纹数据）
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=...kimi/node_modules node test_jsdom_cookielen.js
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
const ol = console.log; console.log = () => {};

async function genCookie(patch) {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oC = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: TARGET, userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (patch) {
    const fc = new Proxy({}, { get(t, p) { if (p === 'canvas') return { width: 300, height: 150, toDataURL: () => 'data:image/png;base64,x' }; return () => undefined; } });
    const wg = new Proxy({}, { get(t, p) { if (p === 'getParameter') return (pr) => pr === 37446 ? 'Intel Iris OpenGL Engine' : 'x'; if (typeof p === 'string') return () => undefined; return undefined; } });
    try {
      window.HTMLCanvasElement.prototype.getContext = function (t) { return (t === 'webgl' || t === 'experimental-webgl') ? wg : fc; };
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,' + 'A'.repeat(200);
    } catch (e) {}
  }
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  const cw = []; let cj = oC || '';
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cw.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  window.eval(outerJsCode);
  await new Promise(r => setTimeout(r, 2500));
  const pC = cw.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  const pVal = pC ? pC.split('=')[1] : null;
  window.close();
  return pVal ? pVal.length : 0;
}
(async () => {
  const noPatch = await genCookie(false);
  const withPatch = await genCookie(true);
  console.log = ol;
  console.log('无 stub P cookie 长度:', noPatch);
  console.log('有 stub P cookie 长度:', withPatch);
  console.log('真实浏览器 P cookie 长度: 428');
  console.log('差异:', withPatch - noPatch, '（正=stub 增加指纹数据）');
  process.exit(0);
})();
