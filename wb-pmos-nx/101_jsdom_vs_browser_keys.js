/**
 * 101_jsdom_vs_browser_keys.js
 *
 * 权威验证 jsdom keys 纯计算：浏览器（patchright + 代理）实时采集 keys2/16/17
 * → jsdom 同 cd 生成 → 数组陷阱对比 keys2/16/17
 * 若一致 → jsdom keys 纯计算 → 管线可注入 jsdom keys 生成真实指纹 cookie
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

const TRAP_CODE = `(function(){
  var r = []; window.__tr = r;
  var OP = Array.prototype.push;
  function copyArr(arr) { var c = []; for (var i = 0; i < Math.min(arr.length, 60); i++) OP.call(c, arr[i]); return c; }
  function rec(arr) {
    if (!arr || r.length >= 300) return;
    var len = arr.length;
    if (len !== 16 && len !== 48) return;
    var ok = len > 0;
    for (var i = 0; i < len; i++) { var v = arr[i]; if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) { ok = false; break; } }
    if (ok) r.push(copyArr(arr));
  }
  var op = Array.prototype.push;
  Array.prototype.push = function() { try { var nl = this.length + arguments.length; if (nl === 16 || nl === 48) { var c = []; for (var i = 0; i < this.length; i++) OP.call(c, this[i]); for (var j = 0; j < arguments.length; j++) OP.call(c, arguments[j]); rec(c); } } catch(e) {} return op.apply(this, arguments); };
  var os = Array.prototype.slice;
  Array.prototype.slice = function() { try { var x = os.apply(this, arguments); if (x) rec(x); return x; } catch(e) { return os.apply(this, arguments); } };
  var oc = Array.prototype.concat;
  Array.prototype.concat = function() { try { var x = oc.apply(this, arguments); if (x) rec(x); return x; } catch(e) { return oc.apply(this, arguments); } };
  var om = Array.prototype.map;
  Array.prototype.map = function() { try { var x = om.apply(this, arguments); if (x) rec(x); return x; } catch(e) { return om.apply(this, arguments); } };
  return 'ok';
})()`;

async function browserCollect() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Runtime.enable');
    let challenge = null, oCookie = '';
    page.on('response', async (resp) => {
      if (resp.status() === 412 && !challenge) {
        try {
          const body = await resp.text();
          const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
          const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
          challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
        } catch (e) {}
      }
    });
    await page.goto(TARGET, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(6000);
    try { await page.reload({ timeout: 90000 }); } catch (e) { console.log('reload err:', e.message.substring(0, 60)); }
    await page.waitForTimeout(15000);
    try { const cks = await context.cookies(); const oc = cks.find(c => c.name.endsWith('O')); if (oc) oCookie = oc.name + '=' + oc.value; } catch (e) {}
    await cdp.send('Runtime.evaluate', { expression: TRAP_CODE, returnByValue: true });
    // 触发 cookie 生成（keys 计算）
    await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`, returnByValue: true });
    const rr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__tr||[])', returnByValue: true });
    let recs = []; try { recs = JSON.parse(rr.result.value); } catch (e) {}
    await context.close();
    if (!challenge) throw new Error('无 challenge');
    const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
    const k48 = dedup(recs.filter(a => a.length === 48 && a.filter(b => b >= 32 && b <= 126).length < 48 * 0.4));
    const k16 = dedup(recs.filter(a => a.length === 16 && !a.every((b, i) => b === K16[i])));
    const keys2 = k48[0] || null;
    const keys17 = k16[0] || null;
    const keys16 = K16;
    console.log('浏览器 nsd:', challenge.nsd, 'keys2:', keys2 ? keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无', 'O:', oCookie ? '有' : '无');
    return { challenge, keys2, keys17, keys16, oCookie };
  } finally { await browser.close(); }
}

function makeDom(nsd, cd, oCookie, onRecord) {
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

async function main() {
  // 1. 浏览器采集
  console.log('=== 浏览器采集（代理）...');
  const br = await browserCollect();
  console.log('浏览器 nsd:', br.challenge.nsd, 'keys2:', br.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  if (br.keys17) console.log('浏览器 keys17:', br.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 2. jsdom 同 cd
  console.log('\n=== jsdom 同 cd 生成...');
  const { nsd, cd } = br.challenge;
  const { window, cookies, records } = makeDom(nsd, cd, br.oCookie);
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.error || e.message || '').substring(0, 80)));
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 25000)); } catch (e) { console.log('外层错误:', e.message.substring(0, 60)); }
  const pCookie = cookies.map(c => c.split(';')[0]).find(c => /P=/.test(c));
  console.log('jsdom 错误数:', errs.length, 'P cookie:', pCookie ? 'len=' + pCookie.split('=')[1].length : '无');
  console.log('jsdom 数组记录:', records.length);

  // 3. 对比
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  const k48 = dedup(records.filter(a => a.length === 48));
  const k16 = dedup(records.filter(a => a.length === 16));
  const jsKeys2 = k48.filter(a => a.filter(b => b >= 32 && b <= 126).length < 48 * 0.4)[0] || null;
  const jsKeys17 = k16.filter(a => !a.every((b, i) => b === K16[i]))[0] || null;
  console.log('\njsdom keys2 :', jsKeys2 ? jsKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('浏览器 keys2:', br.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  if (jsKeys2 && br.keys2) console.log('keys2 相同:', jsKeys2.length === br.keys2.length && jsKeys2.every((v, i) => v === br.keys2[i]) ? '★★★ YES' : 'NO');
  if (jsKeys17 && br.keys17) {
    console.log('jsdom keys17 :', jsKeys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('浏览器 keys17:', br.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys17 相同:', jsKeys17.every((v, i) => v === br.keys17[i]) ? '★★★ YES' : 'NO');
  }
  // 保存
  fs.writeFileSync(path.join(OUT, 'jsdom_vs_browser_' + Date.now() + '.json'), JSON.stringify({ nsd, cd, browser: br, jsdom: { keys2: jsKeys2, keys17: jsKeys17, records, pCookie } }));
  process.exit(0);
}
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
