/**
 * 177_proxy_split.js
 *
 * jsdom + Proxy 包装 split 返回数组：记录 keys[索引] 查表访问 → 重组 basestr
 * 瑞数 numarr2string 用 keys[索引]（keys=basestr.split('')）——Proxy get 记录
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

      // Proxy 包装 split 返回数组
      window.__splitAccess = [];
      window.__splitStrings = [];
      const osplit = window.String.prototype.split;
      window.String.prototype.split = function (sep) {
        const result = osplit.call(this, sep);
        try {
          const s = String(this);
          if (s.length >= 55 && s.length <= 95 && s.includes('-') && s.includes('_')) {
            window.__splitStrings.push({ s, len: s.length });
            // Proxy 包装（只记录数字索引访问）
            const record = window.__splitAccess;
            const proxy = new Proxy(result, {
              get(target, prop, receiver) {
                const val = Reflect.get(target, prop, receiver);
                if (typeof prop === 'string' && /^\d+$/.test(prop)) {
                  record.push({ idx: +prop, val });
                }
                return val;
              },
            });
            return proxy;
          }
        } catch (e) {}
        return result;
      };
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
  console.log('P cookie:', pCookie ? 'len=' + pCookie.split('=')[1].length : '无');
  console.log('split 字符串候选:');
  const dedup = [...new Map((window.__splitStrings || []).map(x => [x.s, x])).values()];
  dedup.slice(0, 8).forEach(x => console.log('  len=' + x.len, JSON.stringify(x.s)));
  console.log('split 访问记录数:', (window.__splitAccess || []).length);
  // 重组 basestr
  const access = window.__splitAccess || [];
  if (access.length) {
    const map = {};
    for (const a of access) map[a.idx] = a.val;
    console.log('访问的索引:', Object.keys(map).map(Number).sort((a, b) => a - b).join(','));
    if (Object.keys(map).length >= 40) {
      const bs = [];
      for (let i = 0; i < 64; i++) bs.push(map[i] !== undefined ? map[i] : '?');
      console.log('★ basestr:', bs.join(''));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
