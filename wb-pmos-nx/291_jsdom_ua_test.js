/**
 * 291_jsdom_ua_test.js
 *
 * jsdom 不同 UA 运行 → keys2 变化测试（验证 keys2 是否依赖 UA）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function runJsdom(ua) {
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;

  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: ua,
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
      if (window.WebGLRenderingContext) {
        window.HTMLCanvasElement.prototype.getContext = function (type) {
          if (String(type).includes('webgl')) return new Proxy({}, { get: (t, p) => { if (p === 'getParameter') return () => null; if (p === 'getExtension') return () => null; return typeof p === 'string' ? () => ({}) : undefined; } });
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
  // 数组陷阱（只抓 48B keys2）
  const records = [];
  window.__tr = records;
  const record = (arr) => {
    if (!arr || records.length >= 300) return;
    const len = arr.length;
    if (len !== 48) return;
    let ok = true;
    for (let i = 0; i < len; i++) { const v = arr[i]; if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) { ok = false; break; } }
    if (ok) records.push([...arr]);
  };
  const op = window.Array.prototype.push;
  window.Array.prototype.push = function () {
    try {
      const nl = this.length + arguments.length;
      if (nl === 48) { const c = []; for (let i = 0; i < this.length; i++) c.push(this[i]); for (let j = 0; j < arguments.length; j++) c.push(arguments[j]); record(c); }
    } catch (e) {}
    return op.apply(this, arguments);
  };
  const os = window.Array.prototype.slice;
  window.Array.prototype.slice = function () { try { const r = os.apply(this, arguments); if (r) record(r); return r; } catch (e) { return os.apply(this, arguments); } };
  const om = window.Array.prototype.map;
  window.Array.prototype.map = function () { try { const r = om.apply(this, arguments); if (r) record(r); return r; } catch (e) { return om.apply(this, arguments); } };

  const origEval = window.eval.bind(window);
  try {
    origEval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 20000));
  } catch (e) {}
  const dedup = [...new Map(records.map(a => [a.join(','), a])).values()];
  const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  const pCookie = pCookieStr ? pCookieStr.split('=')[1] : null;
  return { nsd, records: dedup, pCookie, cookiesWritten };
}

(async () => {
  const UAs = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];
  for (const ua of UAs) {
    const r = await runJsdom(ua);
    const k2 = r.records.filter(a => a.filter(b => b >= 32 && b <= 126).length < 20)[0] || null;
    console.log('UA:' + ua.substring(20, 50), 'P:', r.pCookie ? r.pCookie.length : '无', 'keys2 候选:', k2 ? k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无', '48B 数组:', r.records.length);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
