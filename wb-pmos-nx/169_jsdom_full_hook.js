/**
 * 169_jsdom_full_hook.js
 *
 * jsdom 全面 hook（split/join/substr/indexOf/charAt/fromCharCode）抓 basestr
 * + 对比 jsdom cookie 与浏览器 cookie 前段（确认 IV 是否站点固定）
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

      window.__hooks = { split: [], join: [], substr: [], indexOf: [], charAt: [] };
      // split
      const osplit = window.String.prototype.split;
      window.String.prototype.split = function (sep) { try { const s = String(this); if (s.length >= 55 && s.length <= 95 && s.includes('-')) window.__hooks.split.push(s); } catch (e) {} return osplit.call(this, sep); };
      // join
      const ojoin = window.Array.prototype.join;
      window.Array.prototype.join = function (sep) { try { const l = this.length; if (l >= 55 && l <= 95 && typeof this[0] === 'string') window.__hooks.join.push(this.joinRaw || this.slice(0, 95).join('')); } catch (e) {} return ojoin.call(this, sep); };
      // substr
      const osub = window.String.prototype.substr;
      window.String.prototype.substr = function (a, b) { try { const s = String(this); if (s.length >= 55 && s.length <= 95 && s.includes('-')) window.__hooks.substr.push(s); } catch (e) {} return osub.call(this, a, b); };
      // indexOf
      const oio = window.String.prototype.indexOf;
      window.String.prototype.indexOf = function (a) { try { const s = String(this); if (s.length >= 55 && s.length <= 95 && s.includes('-') && s.includes('_')) window.__hooks.indexOf.push(s); } catch (e) {} return oio.call(this, a); };
      // charAt
      const oc = window.String.prototype.charAt;
      window.String.prototype.charAt = function (i) { try { const s = String(this); if (s.length >= 55 && s.length <= 95 && s.includes('-')) window.__hooks.charAt.push(s); } catch (e) {} return oc.call(this, i); };
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
  console.log('jsdom P cookie 前 22:', pCookie ? pCookie.split('=')[1].substring(0, 22) : '无');
  // 浏览器对比
  const bP = (sync.cookies || []).find(c => c.name.endsWith('P'));
  console.log('浏览器 P cookie 前 22:', bP ? bP.value.substring(0, 22) : '无');

  // hooks 汇总
  for (const [hook, arr] of Object.entries(window.__hooks)) {
    const dedup = [...new Set(arr)];
    console.log(hook + ' 候选:', dedup.length);
    dedup.slice(0, 8).forEach(s => console.log('  len=' + s.length, JSON.stringify(s)));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
