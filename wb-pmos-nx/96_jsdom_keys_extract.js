/**
 * 96_jsdom_keys_extract.js
 *
 * jsdom 执行外层 VM + 动态代码 → 数组陷阱（push/slice/concat/map）抓 keys2/16/17
 * 对比 sync 浏览器 keys 验证纯计算。
 * 思路移植自 85（浏览器 CDP 采集）的 hook + 识别逻辑。
 *
 * 用法：node 96_jsdom_keys_extract.js [SYNC_FILE]
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
  // 1. 读 sync
  const syncFile = process.env.SYNC_FILE || fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  const bk = sync.browserKeys;
  console.log('sync nsd:', nsd, 'bKeys17:', bk.keys17.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('bKeys2 :', bk.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('bKeys16:', bk.keys16.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 2. 沙箱动态代码（同 cd）
  const sandFile = fs.readdirSync(OUT).filter(f => f.startsWith('sandbox_dyn_')).sort().pop();
  const sandDyn = fs.readFileSync(path.join(OUT, sandFile), 'utf8');

  // 3. jsdom + 完整环境补丁
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
      // webgl stub（瑞数指纹采集需要）
      if (window.WebGLRenderingContext) {
        window.HTMLCanvasElement.prototype.getContext = function (type) {
          if (String(type).includes('webgl')) {
            return new Proxy({}, { get: (t, p) => { if (p === 'getParameter') return () => null; if (p === 'getExtension') return () => null; return typeof p === 'string' ? () => ({}) : undefined; } });
          }
          return ctx;
        };
      }
      if (window.OfflineAudioContext) {
        window.OfflineAudioContext = function () { return { startRendering: () => Promise.resolve({ getChannelData: () => new Float32Array(1) }), createOscillator: () => ({ connect() {}, start() {}, frequency: {} }), createDynamicsCompressor: () => ({ connect() {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }), destination: {} }; };
      }
      if (window.AudioContext) window.AudioContext = window.OfflineAudioContext;
      for (const [name, ctor] of [
        ['ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }],
        ['IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }],
        ['Worker', function () { this.postMessage = () => {}; this.terminate = () => {}; this.addEventListener = () => {}; this.onmessage = null; }],
        ['Path2D', function () {}],
        ['DOMMatrix', function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, m11: 1, m12: 0, m21: 0, m22: 1, m41: 0, m42: 0 }; }],
        ['DOMPoint', function (x, y, z, w) { return { x: x || 0, y: y || 0, z: z || 0, w: w || 1 }; }],
      ]) {
        if (!window[name]) { try { window[name] = ctor; } catch (e) {} }
      }
      if (!window.TextEncoder && globalThis.TextEncoder) window.TextEncoder = globalThis.TextEncoder;
      if (!window.TextDecoder && globalThis.TextDecoder) window.TextDecoder = globalThis.TextDecoder;
    },
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const cookiesWritten = [];
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; }, set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; }, configurable: true,
  });

  // 4. 数组陷阱（移植 85：push 是关键）
  const records = [];
  window.__tr = records;
  const copyArr = (arr) => { const c = []; for (let i = 0; i < Math.min(arr.length, 64); i++) c.push(arr[i]); return c; };
  const record = (arr) => {
    if (!arr || records.length >= 400) return;
    const len = arr.length;
    if (len !== 16 && len !== 48) return;
    let ok = len > 0;
    for (let i = 0; i < len; i++) {
      const v = arr[i];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) { ok = false; break; }
    }
    if (ok) records.push(copyArr(arr));
  };
  const op = window.Array.prototype.push;
  window.Array.prototype.push = function () {
    try {
      const nl = this.length + arguments.length;
      if (nl === 16 || nl === 48) { const c = []; for (let i = 0; i < this.length; i++) c.push(this[i]); for (let j = 0; j < arguments.length; j++) c.push(arguments[j]); record(c); }
    } catch (e) {}
    return op.apply(this, arguments);
  };
  const os = window.Array.prototype.slice;
  window.Array.prototype.slice = function () { try { const r = os.apply(this, arguments); if (r) record(r); return r; } catch (e) { return os.apply(this, arguments); } };
  const oc = window.Array.prototype.concat;
  window.Array.prototype.concat = function () { try { const r = oc.apply(this, arguments); if (r) record(r); return r; } catch (e) { return oc.apply(this, arguments); } };
  const om = window.Array.prototype.map;
  window.Array.prototype.map = function () { try { const r = om.apply(this, arguments); if (r) record(r); return r; } catch (e) { return om.apply(this, arguments); } };

  // 5. 执行外层 VM（不 hook eval——瑞数自己 eval 动态代码，环境完整）
  const origEval = window.eval.bind(window);
  const jsdomErrs = [];
  window.addEventListener('error', (e) => {
    jsdomErrs.push(String(e.error || e.message || '').substring(0, 80));
  });
  try {
    origEval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 20000));
  } catch (e) { console.log('外层错误(可忽略):', e.message.substring(0, 60)); }
  console.log('jsdom 错误数:', jsdomErrs.length, jsdomErrs.slice(0, 3).join(' | '));
  console.log('抓到数组记录:', records.length);

  // 6. 识别 keys
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  const k48 = dedup(records.filter(a => a.length === 48));
  const k16 = dedup(records.filter(a => a.length === 16));
  const keys2 = k48.filter(a => a.filter(b => b >= 32 && b <= 126).length < a.length * 0.4)[0] || null;
  // keys17 识别（特征：16B，非 ASCII，特定字节模式）
  let keys17 = null, keys16 = null;
  for (const a of k16) {
    const asciiRatio = a.filter(b => b >= 32 && b <= 126).length / a.length;
    if (asciiRatio < 0.6) {
      if (!keys17) keys17 = a;
      else keys16 = a;
    }
  }
  if (bk.keys16 && k16.some(a => a.length === 16 && a.every((b, i) => b === bk.keys16[i]))) {
    keys16 = k16.find(a => a.every((b, i) => b === bk.keys16[i]));
  }
  console.log('\njsdom keys2 :', keys2 ? keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('浏览器 keys2 :', bk.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  if (keys2) console.log('keys2 相同:', keys2.length === bk.keys2.length && keys2.every((v, i) => v === bk.keys2[i]) ? '★★★ YES' : 'NO');
  console.log('\njsdom keys17:', keys17 ? keys17.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('浏览器 keys17:', bk.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  if (keys17) console.log('keys17 相同:', keys17.length === bk.keys17.length && keys17.every((v, i) => v === bk.keys17[i]) ? '★★★ YES' : 'NO');
  console.log('\njsdom keys16:', keys16 ? keys16.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('浏览器 keys16:', bk.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  if (keys16) console.log('keys16 相同:', keys16.length === bk.keys16.length && keys16.every((v, i) => v === bk.keys16[i]) ? '★★★ YES' : 'NO');

  const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('\njsdom P cookie len:', pCookieStr ? pCookieStr.split('=')[1].length : '无');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
