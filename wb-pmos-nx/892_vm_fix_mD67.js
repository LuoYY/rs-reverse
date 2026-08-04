/**
 * 892_vm_fix_mD67.js
 * 修复 _\$mD 长度：浏览器中 _\$mD 是 67 长（非 626）
 * 之前捕获的 626 是签名表（含 _\$mD 全表），但实际 _$mD 是 67 长
 * 关键：_\$mD[66] = Array
 * 修复 sandbox._\$mD = 67 长的数组（66 个 undefined + Array）
 */
const fs = require('fs');
const vm = require('vm');

// 读取原始 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 在 _\$c4 开头注入参数默认值
const c4Idx = body.indexOf('function _$c4');
const c4Brace = body.indexOf('{', c4Idx);
const inject = `if(_$pL===undefined)_$pL=[[globalThis._\$oU]];if(typeof _$ez==='object'&&_$ez!==null&&!(_$ez instanceof String)){try{_$ez=String.fromCharCode.apply(null,_$ez);}catch(e){}}if(_$gc===undefined)_$gc=globalThis._\$gc;if(_$pb===undefined)_$pb=globalThis._\$pb;if(_$nx===undefined)_$nx=globalThis._\$nx;if(_$cQ===undefined)_$cQ=globalThis._\$cQ;`;
const injected = body.substring(0, c4Brace + 1) + inject + body.substring(c4Brace + 1);
fs.writeFileSync('/tmp/nx_vm_body_fixed.js', injected);
console.log('已注入参数默认值');

// 构建 sandbox
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Buffer, process, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  document: { cookie: '', createElement: () => ({}), createElementNS: () => ({}), getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], body: { appendChild: () => {}, style: {} }, documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {}, createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' }, readyState: 'complete', title: '', hidden: false, visibilityState: 'visible', cookieEnabled: true, referrer: '', charset: 'utf-8', defaultView: null },
  navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.', appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', cookieEnabled: true, plugins: [], mimeTypes: [], product: 'Gecko', productSub: '20030107', appName: 'Netscape', appCodeName: 'Mozilla' },
  location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {}, replace: () => {}, assign: () => {} },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' }, availTop: 0, availLeft: 0, top: 0, left: 0 },
  history: { length: 1, state: null, pushState: () => {}, replaceState: () => {}, back: () => {}, forward: () => {} },
  innerWidth: 1920, innerHeight: 1080, outerWidth: 1920, outerHeight: 1080, screenX: 0, screenY: 0, pageXOffset: 0, pageYOffset: 0, scrollX: 0, scrollY: 0, devicePixelRatio: 2, origin: 'https://pmos.nx.sgcc.com.cn:10443',
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}, getComputedStyle: () => ({}), requestAnimationFrame: (cb) => setTimeout(cb, 16), cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now(), timing: { navigationStart: Date.now() - 1000 } }, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} }, sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, subtle: {} }, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  fetch: () => Promise.reject(new Error('fetch')), XMLHttpRequest: class { open() {} send() {} setRequestHeader() {} }, WebSocket: class {}, DOMParser: class { parseFromString() { return { getElementById: () => null }; } }, AudioContext: class {}, CanvasRenderingContext2D: class {}, matchMedia: () => ({ matches: false }),
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox; sandbox.frames = sandbox;

// VM 表：_$mD 用 67 长（浏览器捕获值）
const mD = new Array(67).fill(null);
// 根据捕获的 truthiness：只有 [66] 是 truthy（Array）
mD[66] = [];
sandbox._$mD = mD;
sandbox._$a2 = sandbox;
sandbox._$oU = tables['_$oU'].val;
sandbox._$b1 = tables['_$b1'].val;
sandbox._$lc = tables['_$lc'].val;
sandbox._$k0 = tables['_$k0'].val;
sandbox._$bk = tables['_$bk'].val;
sandbox._$ez = tables['_$ez'].val;
sandbox._$pL = tables['_$pL'].val;
// 额外参数
sandbox._$lPEz = String.fromCharCode.apply(null, inputs.aebi[1]);
sandbox._$gc = inputs.aebi[4];
sandbox._$pb = inputs.aebi[5];
sandbox._$nx = inputs.aebi[3];
sandbox._$cQ = inputs.aebi[2];

// 输入
sandbox.$_ts = { scj: inputs.scj, aebi: inputs.aebi, cd: inputs.cd || '', nsd: inputs.nsd || 0, cp: {}, jf: {}, lcd: '' };

vm.createContext(sandbox);

console.log('[开始] 执行修复版 VM（_$mD 67 长）...');
try {
  vm.runInContext(injected, sandbox, { timeout: 30000 });
  console.log('[完成] VM 执行成功');
  console.log('[ts] $_ts 字段:', Object.keys(sandbox.$_ts));
  if (sandbox.$_ts.lcd) console.log('[ts.lcd]', JSON.stringify(sandbox.$_ts.lcd).substring(0, 200));
  if (sandbox.$_ts.aebi) console.log('[ts.aebi] len:', sandbox.$_ts.aebi.length);
  fs.writeFileSync('/tmp/nx_vm_result.json', JSON.stringify({ tsKeys: Object.keys(sandbox.$_ts), ts: sandbox.$_ts }, null, 1));
  console.log('已保存 /tmp/nx_vm_result.json');
} catch (e) {
  console.error('[失败]', e.message);
  console.error(e.stack);
  fs.writeFileSync('/tmp/nx_vm_error.txt', e.stack || e.message);
}