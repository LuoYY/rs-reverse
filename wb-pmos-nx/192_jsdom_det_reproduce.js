/**
 * 192_jsdom_det_reproduce.js
 *
 * jsdom hook Math.random=0.5 + Date.now 固定 → 确定性 cookie
 * 手动重现（random=0.5）对比前 22 → 确认 jsdom 的 IV/random 处理
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const FIXED_TIME = 1785580000000;

(async () => {
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const { nsd, cd } = sync.challenge;
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(window) {
      const ctx = new Proxy({}, { get(t, p) {
        if (p === 'canvas') return { width: 300, height: 150 };
        if (p === 'measureText') return (text) => ({ width: (text || '').length * 7 });
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (p === 'createPattern') return () => ({});
        if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
        if (p === 'putImageData' || p === 'drawImage') return () => {};
        return () => {};
      } });
      if (window.HTMLCanvasElement && window.HTMLCanvasElement.prototype) {
        window.HTMLCanvasElement.prototype.getContext = function () { return ctx; };
        window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,iVBORw0KGgo='; };
      }
      if (window.WebGLRenderingContext) window.HTMLCanvasElement.prototype.getContext = function (type) {
        if (String(type).includes('webgl')) return new Proxy({}, { get: (t, p) => { if (p === 'getParameter') return () => null; if (p === 'getExtension') return () => null; return typeof p === 'string' ? () => ({}) : undefined; } });
        return ctx;
      };
      if (window.OfflineAudioContext) {
        window.OfflineAudioContext = function () { return { startRendering: () => Promise.resolve({ getChannelData: () => new Float32Array(1) }), createOscillator: () => ({ connect() {}, start() {}, frequency: {} }), createDynamicsCompressor: () => ({ connect() {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }), destination: {} }; };
      }
      if (window.AudioContext) window.AudioContext = window.OfflineAudioContext;
      for (const [name, ctor] of [['ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }], ['IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }], ['Worker', function () { this.postMessage = () => {}; this.terminate = () => {}; this.addEventListener = () => {}; this.onmessage = null; }], ['Path2D', function () {}]]) {
        if (!window[name]) { try { window[name] = ctor; } catch (e) {} }
      }
      if (!window.TextEncoder && globalThis.TextEncoder) window.TextEncoder = globalThis.TextEncoder;
      if (!window.TextDecoder && globalThis.TextDecoder) window.TextDecoder = globalThis.TextDecoder;

      // 固定随机源
      window.Math.random = function () { return 0.5; };
      var t0 = FIXED_TIME;
      window.Date.now = function () { return t0; };
      window.Date.prototype.getTime = function () { return t0; };
      if (window.performance && window.performance.now) window.performance.now = function () { return t0; };
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues = function (arr) { for (var i = 0; i < arr.length; i++) arr[i] = 0; return arr; };
      }
    },
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const cookies = [];
  let cj = '';
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.error || e.message || '').substring(0, 80)));
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 25000)); } catch (e) { console.log('外层错误:', e.message.substring(0, 60)); }
  const pCookie = cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  if (!pCookie) { console.log('无 cookie'); process.exit(0); }
  const payload = pCookie.split('=')[1];
  console.log('jsdom 确定性 cookie 前 22:', payload.substring(0, 22));
  console.log('cookie 长度:', payload.length);

  // 手动重现（random=0.5）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const parser = require('@src/handler/parser');
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { xor } = require('@src/handler/parser/common/');
  const decrypt = require('@src/handler/parser/common/decrypt');
  const { numToNumarr4, uuid, numarrJoin, numarr2string } = parser;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  const cdArr = decrypt(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  function getLensGo(numarr, idx) {
    const item = numarr[idx]; idx++;
    let lens;
    if ((item & 128) === 0) lens = item;
    else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
    else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
    else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
    else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
    else lens = item;
    return [lens, idx];
  }
  function genKeysSim(ans) {
    const keys = [];
    let op = 1, gap;
    try {
      for (let i = 0; i < ans[0]; i++) { [gap, op] = getLensGo(ans, op); if (gap < 0 || op + gap > ans.length) return null; keys.push(ans.slice(op, op + gap)); op += gap; }
    } catch (e) { return null; }
    return keys;
  }
  let offset = null, keys = null;
  const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
  for (let k0 = 0; k0 <= 127 && !offset; k0++) {
    const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
    for (let k1 = 0; k1 <= 127 && !offset; k1++) {
      const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
      const off = [off0, off1, off2, off3, off4, off5, off6, off7];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      const kk = genKeysSim(ans);
      if (kk && [29, 30, 31, 32].every(k => kk[k] && kk[k].length === 4) && kk[2] && kk[2].length === 48) { offset = off; keys = kk; }
    }
  }
  if (!keys) { console.log('keys 推导失败'); process.exit(0); }
  const runTime = Math.floor(FIXED_TIME / 1000);
  const random = 0.5;
  const basearr = require('@src/handler/basearr/len243-nx')('SVRWShdXQRdKXlpaF1pWVBdaVw==', {});
  let r2mkaTime = 0;
  if (keys[21]) r2mkaTime = parseInt(keys[21].map(c => String.fromCharCode(c)).join(''), 10);
  const startTime = runTime - 1;
  const basearrEncrypt = encryptMode1(xor(numarrEncrypt(basearr), keys[2], 16), numarrAddTime(keys[17], runTime, random)[0], 0);
  const nextarr = numarrJoin(numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys[2]), undefined, basearrEncrypt);
  const enc = encryptMode1([...numToNumarr4(uuid(nextarr)), ...nextarr], numarrAddTime(keys[16], runTime, random)[0], 1, random);
  const myCookie = '0' + numarr2string(enc, B64.split(''));
  console.log('重现 cookie 前 22:', myCookie.substring(0, 22));
  console.log('前 22 相同:', myCookie.substring(0, 22) === payload.substring(0, 22) ? '★★★ YES' : 'NO');
  // 枚举 random
  let foundR = null;
  for (let r2 = 0; r2 <= 1 && !foundR; r2 += 0.01) {
    const enc2 = encryptMode1([...numToNumarr4(uuid(nextarr)), ...nextarr], numarrAddTime(keys[16], runTime, r2)[0], 1, r2);
    const c2 = '0' + numarr2string(enc2, B64.split(''));
    if (c2.substring(0, 22) === payload.substring(0, 22)) foundR = r2;
  }
  console.log('IV 匹配 random:', foundR !== null ? foundR : '未找到');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
