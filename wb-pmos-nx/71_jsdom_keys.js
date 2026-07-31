/**
 * 71_jsdom_keys.js
 *
 * 验证 nx 密钥纯计算：用 sync 会话的 nsd/cd 跑 jsdom 生成 cookie
 * → 反解 keys → 对比浏览器 keys（同 cd 应逐字节一致）
 * 这是 xj 文档转机4/5 的方法（jsdom 密钥计算器 + 对照验证）
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) { const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]]; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  else if (qi + 1 < s.length) bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  return bytes;
}

(async () => {
  // 1. 读 sync（浏览器 keys 对照）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  const bKeys = sync.browserKeys;
  console.log('浏览器 nsd:', nsd);
  console.log('浏览器 keys2 :', bKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys16:', bKeys.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys17:', bKeys.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 2. jsdom 用同 cd 跑（补 canvas/webgl stub 避免内层 VM TypeError）
  console.log('\n[jsdom] 执行（同 cd，补 canvas stub）...');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
    beforeParse(window) {
      // canvas 2d context stub（瑞数指纹采集需要，jsdom 无 canvas 包）
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
      // webgl stub
      if (window.WebGLRenderingContext) {
        window.HTMLCanvasElement.prototype.getContext = function (type) {
          if (String(type).includes('webgl')) {
            return new Proxy({}, { get: (t, p) => { if (p === 'getParameter') return () => null; if (p === 'getExtension') return () => null; return typeof p === 'string' ? () => ({} ) : undefined; } });
          }
          return ctx;
        };
      }
      // 其它常用缺漏（jsdom 没有的 API）
      if (window.OfflineAudioContext) {
        window.OfflineAudioContext = function () { return { startRendering: () => Promise.resolve({ getChannelData: () => new Float32Array(1) }), createOscillator: () => ({ connect() {}, start() {}, frequency: {} }), createDynamicsCompressor: () => ({ connect() {}, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }), destination: {} }; };
      }
      if (window.AudioContext) window.AudioContext = window.OfflineAudioContext;
      // jsdom 明确没有的：ResizeObserver / IntersectionObserver / Worker / Path2D / DOMMatrix
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
      // TextEncoder/TextDecoder（Node 全局有，jsdom window 可能有也可能没有）
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
  // 捕获 jsdom 内层 TypeError（定位缺失 API）
  const jsdomErrs = [];
  window.addEventListener('error', (e) => {
    const msg = String(e.error || e.message || '').substring(0, 100);
    const stack = e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 4).join(' | ').substring(0, 200) : '';
    jsdomErrs.push(msg + ' :: ' + stack);
  });
  // ★ 原生 eval（不 hook）——jsdom 混淆可能是 eval 被 hook 导致
  const origWindowEval = window.eval.bind(window);
  try {
    origWindowEval(fs.readFileSync(OUTER_JS, 'utf8'));
    await new Promise(r => setTimeout(r, 10000));
  } catch (e) { console.log('  外层错误(可忽略):', e.message.substring(0, 60)); }
  console.log('jsdom 内层错误数:', jsdomErrs.length);
  [...new Set(jsdomErrs)].slice(0, 6).forEach((s, i) => console.log('  err' + i + ':', s));
  const pCookieStr = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  if (!pCookieStr) { console.log('✗ jsdom 未生成 P'); process.exit(1); }
  console.log('jsdom P cookie len:', pCookieStr.split('=')[1].length);

  // 3. 初始化管线（加密/解密函数）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  // 4. 反解外层（用浏览器 keys16 遍历 time/ele，严格 uuid 校验）
  const parser = require('@src/handler/parser');
  const bytes = decodeStr(pCookieStr.split('=')[1].slice(1));
  console.log('\njsdom cookie 解码:', bytes.length, 'B');
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 900; t <= now + 900 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...bKeys.keys16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 50 && dec[4] === 4 && dec[14] === 48) {
          // 严格 uuid 校验（排除宽松判据的错匹配）
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec, uuidOk: true };
          else if (!found) found = { t, ele, dec, uuidOk: false };  // 记录首个候选（含 uuid 失败）
        }
      } catch (e) {}
    }
  }
  if (!found) { console.log('✗ jsdom cookie 外层解密失败（keys16 或结构）'); process.exit(1); }
  console.log('外层解密 t=' + found.t + ' uuidOk=' + found.uuidOk + (found.uuidOk ? '' : '（无 uuid 匹配，结构可疑）'));
  const na = found.dec.slice(4);
  const jsKeys2 = na.slice(11, 59);
  console.log('外层解密成功 t=' + found.t);
  console.log('jsdom keys2 :', jsKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys2:', bKeys.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const k2match = jsKeys2.length === bKeys.keys2.length && jsKeys2.every((b, i) => b === bKeys.keys2[i]);
  console.log('keys2 匹配:', k2match ? '★★★ YES 密钥纯计算!' : 'NO ✗');

  // 5. 反解内层（用浏览器 keys17）→ 对比 basearr 明文结构
  // innerEnc 从 na[61..]（na[10]=48 keys2len, 之后 encLen 前缀）
  const k2len = na[10];
  let pos = 11 + k2len;
  const lenByte = na[pos++];
  let innerLen;
  if (lenByte & 0x80) { innerLen = ((lenByte & 0x7f) << 8) | na[pos++]; }
  else innerLen = lenByte;
  const innerEnc = na.slice(pos, pos + innerLen);
  console.log('\ninnerEnc len:', innerEnc.length);
  // 用 keys17 遍历解密
  let foundI = null;
  for (let dt = -60; dt <= 60 && !foundI; dt++) {
    for (let ele = 1; ele <= 256 && !foundI; ele++) {
      try {
        const arr = numarrAddTime([...bKeys.keys17], found.t + dt, ele / 256)[0];
        const dec = encryptMode2([...innerEnc], arr, 0);
        if (dec.length > 200) {
          // 检查明文是否像 numenc（XOR keys2 后结构合理）
          const numenc = dec.map((b, i) => i < 16 ? b ^ jsKeys2[i] : b);
          if (numenc.length === 288) foundI = { t: found.t + dt, ele, dec: numenc };
        }
      } catch (e) {}
    }
  }
  if (foundI) {
    console.log('内层解密成功 numenc len:', foundI.dec.length);
    console.log('jsdom numenc 前16:', foundI.dec.slice(0, 16).map(b => b.toString(16)).join(' '));
  } else {
    console.log('内层解密未匹配（可能 jsdom 指纹段结构不同）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
