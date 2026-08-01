/**
 * 206_instrument_run2.js
 *
 * 修复插桩：globalThis + 精确替换 _$o1 的 while
 * 追踪操作码流 → 理解 nx 操作码
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

  let dyn = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
  const o1Idx = dyn.indexOf('function _$o1(');
  // 在 _$o1 函数内的 while 精确位置替换
  const wStart = dyn.indexOf('while(1){_$k7=_$pb[_$ne++];', o1Idx);
  if (wStart < 0) { console.log('while 未找到'); process.exit(1); }
  const pat = 'while(1){_$k7=_$pb[_$ne++];';
  const inst = 'while(1){if(!globalThis.__oplog)globalThis.__oplog=[];if(globalThis.__oplog.length<200000)globalThis.__oplog.push(_$k7);_$k7=_$pb[_$ne++];';
  dyn = dyn.substring(0, wStart) + inst + dyn.substring(wStart + pat.length);
  fs.writeFileSync('/tmp/nx_dyn_instr2.js', dyn);
  console.log('插桩 @', wStart, '完成');

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
    },
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  const cookies = [];
  let cj = '';
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.error || e.message || '').substring(0, 80)));
  const t0 = Date.now();
  try { window.eval(fs.readFileSync('/tmp/nx_dyn_instr2.js', 'utf8')); await new Promise(r => setTimeout(r, 30000)); } catch (e) { console.log('外层错误:', e.message.substring(0, 80)); }
  console.log('执行耗时:', Date.now() - t0, 'ms');
  const pCookie = cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('P cookie:', pCookie ? 'len=' + pCookie.split('=')[1].length : '无');
  const oplog = globalThis.__oplog || window.__oplog || [];
  console.log('操作码记录:', oplog.length);
  const freq = {};
  oplog.forEach(o => freq[o] = (freq[o] || 0) + 1);
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  console.log('操作码频率 top 30:');
  sorted.slice(0, 30).forEach(([op, c]) => console.log('  op' + op + ': ' + c + '次'));
  if (oplog.length) fs.writeFileSync('/tmp/nx_oplog.json', JSON.stringify({ oplog, freq: sorted }));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
