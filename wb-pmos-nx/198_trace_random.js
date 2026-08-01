/**
 * 198_trace_random.js
 *
 * jsdom 执行 dynCode：hook Math.random/crypto.getRandomValues/Date.now 记录所有调用
 * 分析 IV 生成的随机值序列（外层加密）
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

      window.__randLog = [];
      var or = window.Math.random;
      window.Math.random = function () { var r = or(); window.__randLog.push({ t: 'rand', v: r }); return r; };
      if (window.crypto && window.crypto.getRandomValues) {
        var og = window.crypto.getRandomValues;
        window.crypto.getRandomValues = function (arr) { var r = og.call(this, arr); window.__randLog.push({ t: 'crypto', len: arr.length, v: Array.prototype.slice.call(arr) }); return r; };
      }
      var od = window.Date.now;
      window.Date.now = function () { var r = od(); window.__randLog.push({ t: 'date', v: r }); return r; };
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
  console.log('P cookie 前 22:', pCookie ? pCookie.split('=')[1].substring(0, 22) : '无');
  const log = window.__randLog || [];
  console.log('随机源调用总数:', log.length);
  // 分析：统计各类调用
  const types = {};
  log.forEach(l => types[l.t] = (types[l.t] || 0) + 1);
  console.log('调用类型:', JSON.stringify(types));
  // 打印 cookie 生成前的最后 40 个调用（IV 生成相关）
  console.log('\n最后 50 个调用:');
  log.slice(-50).forEach((l, i) => {
    if (l.t === 'rand') console.log('  [' + (log.length - 50 + i) + '] rand:', l.v.toFixed(6));
    else if (l.t === 'crypto') console.log('  [' + (log.length - 50 + i) + '] crypto len=' + l.len, l.len <= 16 ? l.v.map(b => b.toString(16).padStart(2, '0')).join(' ') : '(大)');
    else console.log('  [' + (log.length - 50 + i) + '] date:', l.v);
  });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
