/**
 * 209_jsdom_trap_all.js
 *
 * jsdom 完整执行外层 VM + 动态代码，数组陷阱记录所有数组（不限长度）
 * 目标：
 *  1. 抓 basearr 明文（numarrEncrypt 输入，大数组 100-600B）——解析 nx basearr 布局
 *  2. 抓 64 字符数组（basestr 字符代码）——确认 basestr 顺序
 *  3. 抓 keys16/17/2（校准纯算法）
 *  4. 抓 P cookie + 确定性 hook（Math.random/Date.now 固定）
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
const FIXED_RANDOM = 0.5;
const FIXED_TIME = 1785580000000;

(async () => {
  // 1. 用最新 sync 会话（同 nsd/cd）
  const syncFile = process.env.SYNC_FILE || fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('sync nsd:', nsd, 'cd len:', (cd || '').length);
  const bk = sync.browserKeys;
  console.log('bKeys16:', bk.keys16.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 2. jsdom + 环境补丁（复用 96）
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(window) {
      // 确定性 hook
      Math.random = function () { return FIXED_RANDOM; };
      Date.now = function () { return FIXED_TIME; };
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues = function (arr) { return arr; };
      }
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

  // 3. 数组陷阱：记录所有长度 3-600 的数字数组
  const records = [];
  window.__tr = records;
  const copyArr = (arr) => { const c = []; for (let i = 0; i < Math.min(arr.length, 600); i++) c.push(arr[i]); return c; };
  const record = (arr) => {
    if (!arr || records.length >= 2000) return;
    const len = arr.length;
    if (len < 3 || len > 600) return;
    let ok = len > 0;
    for (let i = 0; i < Math.min(len, 600); i++) {
      const v = arr[i];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) { ok = false; break; }
    }
    if (ok) records.push({ len, arr: copyArr(arr) });
  };
  const op = window.Array.prototype.push;
  window.Array.prototype.push = function () {
    try {
      const nl = this.length + arguments.length;
      if (nl >= 3 && nl <= 600) {
        const c = []; for (let i = 0; i < this.length; i++) c.push(this[i]);
        for (let j = 0; j < arguments.length; j++) c.push(arguments[j]);
        record(c);
      }
    } catch (e) {}
    return op.apply(this, arguments);
  };
  const os = window.Array.prototype.slice;
  window.Array.prototype.slice = function () { try { const r = os.apply(this, arguments); if (r) record(r); return r; } catch (e) { return os.apply(this, arguments); } };
  const oc = window.Array.prototype.concat;
  window.Array.prototype.concat = function () { try { const r = oc.apply(this, arguments); if (r) record(r); return r; } catch (e) { return oc.apply(this, arguments); } };
  const om = window.Array.prototype.map;
  window.Array.prototype.map = function () { try { const r = om.apply(this, arguments); if (r) record(r); return r; } catch (e) { return om.apply(this, arguments); } };

  // 4. 执行外层 VM
  const origEval = window.eval.bind(window);
  const jsdomErrs = [];
  window.addEventListener('error', (e) => { jsdomErrs.push(String(e.error || e.message || '').substring(0, 80)); });
  try {
    origEval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 25000));
  } catch (e) { console.log('外层错误(可忽略):', e.message.substring(0, 60)); }
  console.log('jsdom 错误数:', jsdomErrs.length, jsdomErrs.slice(0, 3).join(' | '));
  console.log('抓到数组记录:', records.length);

  const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  const pCookie = pCookieStr ? pCookieStr.split('=')[1] : null;
  console.log('P cookie len:', pCookie ? pCookie.length : '无');
  if (pCookie) console.log('P cookie 前 22:', pCookie.substring(0, 22));

  // 5. 保存所有记录
  const dedup = [...new Map(records.map(r => [r.len + ':' + r.arr.join(','), r])).values()];
  console.log('去重后:', dedup.length);
  // 按长度分类统计
  const byLen = {};
  for (const r of dedup) { byLen[r.len] = (byLen[r.len] || 0) + 1; }
  const lens = Object.keys(byLen).map(Number).sort((a, b) => a - b);
  console.log('长度分布:', lens.map(l => l + '×' + byLen[l]).join(', '));

  // 找 keys16 匹配（校准数组陷阱）
  const k16Matches = dedup.filter(r => r.len === 16 && r.arr.every((v, i) => v === bk.keys16[i]));
  console.log('keys16 匹配数组:', k16Matches.length);

  // 找 64 字符数组（字符代码 32-126）
  const k64 = dedup.filter(r => r.len === 64 && r.arr.every(v => v >= 32 && v <= 126));
  console.log('64 字符数组候选:', k64.length);
  k64.slice(0, 5).forEach(r => console.log('  64:', r.arr.map(b => String.fromCharCode(b)).join('')));

  // 大数组候选（basearr 明文）
  const bigs = dedup.filter(r => r.len >= 100 && r.len <= 600).sort((a, b) => a.len - b.len);
  console.log('大数组候选:', bigs.length);
  bigs.slice(0, 10).forEach(r => console.log('  大[' + r.len + ']:', r.arr.slice(0, 20).join(',')));

  // 保存完整
  fs.writeFileSync(path.join(OUT, 'trap_all_' + nsd + '.json'), JSON.stringify({
    nsd, pCookie, fixedRandom: FIXED_RANDOM, fixedTime: FIXED_TIME,
    k64: k64.map(r => r.arr.map(b => String.fromCharCode(b)).join('')),
    bigs: bigs.map(r => r.arr),
    all: dedup.map(r => r.arr).slice(0, 2000),
  }));
  console.log('已保存 trap_all_' + nsd + '.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
