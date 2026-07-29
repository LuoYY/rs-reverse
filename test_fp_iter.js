/**
 * 快速迭代：jsdom 补全指纹 → 生成 cookie → 检查长度（向 428 靠近）+ 重放状态
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=...kimi/node_modules node test_fp_iter.js
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

function patchFingerprint(window) {
  // window.chrome
  try { window.chrome = { app: {}, runtime: {}, csi: () => ({}), loadTimes: () => ({}) }; } catch (e) {}
  // canvas 2d/webgl
  const c2d = { canvas: { toDataURL: () => 'data:image/png;base64,' + 'A'.repeat(300) }, fillText: () => {}, measureText: () => ({ width: 50 }), getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4).fill(0) }), font: '10px sans-serif', fillStyle: '#000' };
  const wg = { getParameter: (p) => ({ 37445: 'Intel Inc.', 37446: 'Intel Iris OpenGL Engine', 7936: 'WebKit', 7937: 'WebKit WebGL', 7938: 'WebGL 1.0' }[p] || 0), getExtension: () => ({ UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 }), getSupportedExtensions: () => ['WEBGL_debug_renderer_info', 'OES_texture_float'] };
  try {
    window.HTMLCanvasElement.prototype.getContext = function (t) { return (t === 'webgl' || t === 'experimental-webgl' || t === 'webgl2') ? wg : c2d; };
    window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,' + 'A'.repeat(300);
    if (!window.WebGLRenderingContext) window.WebGLRenderingContext = function () {};
  } catch (e) {}
  // plugins/mimeTypes
  try {
    const plugins = [{ name: 'PDF Viewer' }, { name: 'Chrome PDF Viewer' }, { name: 'Chromium PDF Viewer' }, { name: 'Microsoft Edge PDF Viewer' }, { name: 'WebKit built-in PDF' }];
    plugins.item = (i) => plugins[i]; plugins.namedItem = (n) => plugins.find(p => p.name === n); plugins.refresh = () => {};
    Object.defineProperty(window.navigator, 'plugins', { get: () => plugins, configurable: true });
    Object.defineProperty(window.navigator, 'mimeTypes', { get: () => [{ type: 'application/pdf' }], configurable: true });
  } catch (e) {}
  // navigator
  try {
    for (const [k, v] of Object.entries({ languages: ['zh-CN', 'zh', 'en'], hardwareConcurrency: 8, deviceMemory: 8, webdriver: false, vendor: 'Google Inc.', productSub: '20030107', pdfViewerEnabled: true })) {
      Object.defineProperty(window.navigator, k, { get: () => v, configurable: true });
    }
  } catch (e) {}
  // screen/window
  try {
    for (const [k, v] of Object.entries({ width: 1680, height: 1050, availWidth: 1680, availHeight: 1025, colorDepth: 24, pixelDepth: 24 })) Object.defineProperty(window.screen, k, { get: () => v, configurable: true });
    for (const [k, v] of Object.entries({ innerWidth: 1680, innerHeight: 938, outerWidth: 1680, outerHeight: 1025, devicePixelRatio: 2 })) Object.defineProperty(window, k, { get: () => v, configurable: true });
  } catch (e) {}
}

async function genCookie(patch) {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oC = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: TARGET, userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (patch) patchFingerprint(window);
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };
  const cw = []; let cj = oC || '';
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cw.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  window.eval(outerJsCode);
  await new Promise(r => setTimeout(r, 2500));
  // 取【最后一个】P cookie（内层 VM 可能写多次，最后的是完整版）
  const pCookies = cw.map(c => c.split(';')[0]).filter(c => /P=/.test(c));
  const pC = pCookies[pCookies.length - 1];
  const pCFirst = pCookies[0];
  window.close();
  const result = { pCount: pCookies.length, firstLen: pCFirst ? pCFirst.split('=')[1].length : 0 };
  if (!pC) return { ...result, len: 0 };
  const pVal = pC.split('=')[1];
  const replay = await httpGet(TARGET, oC + '; ' + pC);
  const isWarn = /访问行为异常|监测到您的访问/.test(replay.body);
  const isBusiness = replay.body.length > 2000;
  return { ...result, len: pVal.length, status: replay.status, isWarn, isBusiness, bodyLen: replay.body.length };
}
(async () => {
  const noPatch = await genCookie(false);
  console.log = ol;
  console.log(`无补全: P数=${noPatch.pCount} 首个len=${noPatch.firstLen} 最后len=${noPatch.len} status=${noPatch.status} bodyLen=${noPatch.bodyLen} ${noPatch.isWarn ? '警告页' : noPatch.isBusiness ? '业务页✓' : '其他'}`);
  const withPatch = await genCookie(true);
  console.log(`全补全: P数=${withPatch.pCount} 首个len=${withPatch.firstLen} 最后len=${withPatch.len} status=${withPatch.status} bodyLen=${withPatch.bodyLen} ${withPatch.isWarn ? '警告页' : withPatch.isBusiness ? '业务页✓✓✓' : '其他'}`);
  console.log(`\n目标: len→428(真实), bodyLen→~9000(业务页)`);
  process.exit(0);
})();
