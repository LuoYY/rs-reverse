/**
 * 153_jsdom_basestr.js
 *
 * jsdom 执行外层 JS 生成 cookie → 数组陷阱抓 keys16/runTime 相关
 * → 解密 jsdom cookie（自洽）→ 密文字节 ↔ cookie 字符 反推 nx basestr 顺序
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

function makeDom(nsd, cd, oCookie) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(window) {
      const ctx = new Proxy({}, {
        get(t, p) {
          if (p === 'canvas') return { width: 300, height: 150 };
          if (p === 'measureText') return (text) => ({ width: (text || '').length * 7 });
          if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
          if (p === 'createPattern') return () => ({});
          if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
          if (p === 'putImageData' || p === 'drawImage') return () => {};
          return () => {};
        },
      });
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
      for (const [name, ctor] of [
        ['ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }],
        ['IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }],
        ['Worker', function () { this.postMessage = () => {}; this.terminate = () => {}; this.addEventListener = () => {}; this.onmessage = null; }],
        ['Path2D', function () {}],
      ]) {
        if (!window[name]) { try { window[name] = ctor; } catch (e) {} }
      }
      if (!window.TextEncoder && globalThis.TextEncoder) window.TextEncoder = globalThis.TextEncoder;
      if (!window.TextDecoder && globalThis.TextDecoder) window.TextDecoder = globalThis.TextDecoder;
    },
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const cookies = [];
  let cj = oCookie;
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  // 数组陷阱
  const records = [];
  window.__tr = records;
  const copyArr = (arr) => { const c = []; for (let i = 0; i < Math.min(arr.length, 64); i++) c.push(arr[i]); return c; };
  const record = (arr) => {
    if (!arr || records.length >= 300) return;
    const len = arr.length;
    if (len !== 16 && len !== 48) return;
    let ok = len > 0;
    for (let i = 0; i < len; i++) { const v = arr[i]; if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) { ok = false; break; } }
    if (ok) records.push(copyArr(arr));
  };
  const op = window.Array.prototype.push;
  window.Array.prototype.push = function () { try { const nl = this.length + arguments.length; if (nl === 16 || nl === 48) { const c = []; for (let i = 0; i < this.length; i++) c.push(this[i]); for (let j = 0; j < arguments.length; j++) c.push(arguments[j]); record(c); } } catch (e) {} return op.apply(this, arguments); };
  const os = window.Array.prototype.slice;
  window.Array.prototype.slice = function () { try { const x = os.apply(this, arguments); if (x) record(x); return x; } catch (e) { return os.apply(this, arguments); } };
  const oc = window.Array.prototype.concat;
  window.Array.prototype.concat = function () { try { const x = oc.apply(this, arguments); if (x) record(x); return x; } catch (e) { return oc.apply(this, arguments); } };
  const om = window.Array.prototype.map;
  window.Array.prototype.map = function () { try { const x = om.apply(this, arguments); if (x) record(x); return x; } catch (e) { return om.apply(this, arguments); } };
  return { dom, window, cookies, records };
}

(async () => {
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const { nsd, cd } = sync.challenge;
  const { window, cookies, records } = makeDom(nsd, cd, '');
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.error || e.message || '').substring(0, 80)));
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 25000)); } catch (e) { console.log('外层错误:', e.message.substring(0, 60)); }
  const pCookie = cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('jsdom 错误数:', errs.length, 'P cookie:', pCookie ? 'len=' + pCookie.split('=')[1].length : '无');
  console.log('数组记录:', records.length);
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  const k16s = dedup(records.filter(a => a.length === 16));
  const k48s = dedup(records.filter(a => a.length === 48));
  console.log('16B 数组候选:', k16s.length, '48B:', k48s.length);
  // jsdom cookie 字符集
  if (pCookie) {
    const chars = [...new Set(pCookie.split('=')[1].split(''))].sort();
    console.log('jsdom cookie 字符集:', chars.join(''), '(', chars.length, ')');
    fs.writeFileSync(path.join(OUT, 'jsdom_basestr_' + Date.now() + '.json'), JSON.stringify({ nsd, pCookie, k16s, k48s, records, errs, cookies }));
    console.log('已保存');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
