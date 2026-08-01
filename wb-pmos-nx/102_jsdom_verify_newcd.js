/**
 * 102_jsdom_verify_newcd.js
 *
 * 用最新浏览器采集会话（85 号产物），jsdom 同 cd 生成 → 对比 keys2
 * 方法：① 数组陷阱 ② cookie 反解（K16 + ±7200 宽窗口）
 * 判定 jsdom keys 是否纯计算（与浏览器一致）
 *
 * 用法：node 102_jsdom_verify_newcd.js
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
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

function decodeStr(s) {
  const payload = s.startsWith('0') ? s.slice(1) : s;
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < payload.length) { const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < payload.length) bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
  return bytes;
}

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
  const cookies = [];
  let cj = oCookie;
  Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; }, configurable: true });
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
  // 读最新采集会话
  const mf = fs.readdirSync(OUT).filter(f => f.startsWith('multi_cd_keys_')).sort().pop();
  const sessions = JSON.parse(fs.readFileSync(path.join(OUT, mf)));
  const s = sessions.find(x => x.keys2 && x.cd);
  if (!s) { console.log('无有效会话'); process.exit(1); }
  const { nsd, cd, keys2: bKeys2, oCookie } = s;
  console.log('采集会话 nsd:', nsd, '浏览器 keys2:', bKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 管线初始化（解密函数）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  // jsdom 同 cd
  console.log('\njsdom 同 cd 生成...');
  const { window, cookies, records } = makeDom(nsd, cd, oCookie || '');
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.error || e.message || '').substring(0, 80)));
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 25000)); } catch (e) { console.log('外层错误:', e.message.substring(0, 60)); }
  const pCookie = cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('jsdom 错误数:', errs.length, 'P cookie:', pCookie ? 'len=' + pCookie.split('=')[1].length : '无');

  // 方法①：数组陷阱
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  const k48 = dedup(records.filter(a => a.length === 48));
  const k16 = dedup(records.filter(a => a.length === 16));
  console.log('jsdom 48B 数组候选数:', k48.length, '16B 候选数:', k16.length);
  k48.forEach((a, i) => console.log('  48B[' + i + ']:', a.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')));
  // 找与浏览器 keys2 完全匹配的
  const exactMatch = k48.find(a => a.length === bKeys2.length && a.every((v, i) => v === bKeys2[i]));
  console.log('与浏览器 keys2 完全匹配:', exactMatch ? '★★★ YES（jsdom keys2 纯计算!）' : 'NO');
  const jsKeys2 = k48.filter(a => a.filter(b => b >= 32 && b <= 126).length < 48 * 0.4)[0] || null;
  console.log('jsdom 数组陷阱 keys2(首候选):', jsKeys2 ? jsKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  if (jsKeys2) console.log('keys2 相同:', jsKeys2.every((v, i) => v === bKeys2[i]) ? '★★★ YES' : 'NO');

  // 方法②：cookie 反解（K16 + ±7200）
  if (pCookie) {
    const bytes = decodeStr(pCookie.split('=')[1]);
    console.log('jsdom cookie 解码:', bytes.length, 'B');
    const now = Math.floor(Date.now() / 1000);
    let found = null, loose = null;
    for (let t = now - 7200; t <= now + 7200 && !found; t++) {
      for (let ele = 1; ele <= 256 && !found; ele++) {
        try {
          const arr = numarrAddTime([...K16], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 50 && dec[4] === 4 && dec[14] === 48) {
            const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
            if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec };
            else if (!loose) loose = { t, ele, dec };
          }
        } catch (e) {}
      }
    }
    if (found) {
      const na = found.dec.slice(4);
      const rk2 = na.slice(11, 59);
      console.log('反解成功 t=' + found.t + ' keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('反解 keys2 相同:', rk2.every((v, i) => v === bKeys2[i]) ? '★★★ YES' : 'NO');
      if (!rk2.every((v, i) => v === bKeys2[i])) console.log('浏览器 keys2:', bKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    } else {
      console.log('反解失败:', loose ? '仅宽松候选 uuid ✗' : '无候选');
      if (loose) console.log('宽松候选 dec[4]=' + loose.dec[4] + ' dec[14]=' + loose.dec[14] + ' dec len=' + loose.dec.length);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
