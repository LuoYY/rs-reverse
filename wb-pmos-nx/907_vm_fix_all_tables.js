/**
 * 907_vm_fix_all_tables.js
 * 完整修复：在 IIFE 开头注入所有表的全局引用 + 环境模拟
 * 关键：VM 需要 _\$oP/_\$f$/_\$lC/_\$mD(67)/_\$oU 等全部表
 * 及 _\$mD 的 truthiness 精确匹配（浏览器捕获）
 */
const fs = require('fs');
const vm = require('vm');

// 读取原始 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 注入 IIFE 开头的所有表引用
const inject = `var _\$oU = globalThis._\$oU;
var _\$b1 = globalThis._\$b1;
var _\$lc = globalThis._\$lc;
var _\$mD = globalThis._\$mD;
var _\$k0 = globalThis._\$k0;
var _\$oP = globalThis._\$oP;
var _\$f$ = globalThis._\$f$;
var _\$lC = globalThis._\$lC;
var _\$ll = globalThis._\$ll;
var _\$a2 = globalThis;
var window = globalThis;
var document = globalThis.document;
var navigator = globalThis.navigator;
var screen = globalThis.screen;
var location = globalThis.location;
var history = globalThis.history;
`;
const braceIdx = body.indexOf('{');
const injected = body.substring(0, braceIdx + 1) + inject + body.substring(braceIdx + 1);
fs.writeFileSync('/tmp/nx_vm_body_fixed4.js', injected);
console.log('已生成 body_fixed4（全部表注入）');

// 读取表
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const more = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_more.json', 'utf8'));
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

function parseArr(val) {
  return val.map(v => {
    if (typeof v === 'string') {
      if (v === 'null') return null;
      if (v.startsWith('fn:')) return function () {};
      if (v.startsWith('obj:')) return {};
      if (v.startsWith('n:')) return +v.substring(2);
      if (v.startsWith('s:')) return v.substring(2);
      if (v.startsWith('b:')) return v.substring(2) === 'true';
      return v;
    }
    return v;
  });
}

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

// 全部表
sandbox._$a2 = sandbox;
sandbox._$oU = tables['_$oU'].val;
sandbox._$b1 = tables['_$b1'].val;
sandbox._$lc = tables['_$lc'].val;
sandbox._$mD = new Array(67).fill(null);
sandbox._$mD[66] = [];
sandbox._$k0 = tables['_$k0'].val;
sandbox._$bk = tables['_$bk'].val;
sandbox._$ez = tables['_$ez'].val;
sandbox._$pL = tables['_$pL'].val;
['_$oP', '_$f$', '_$lC', '_$ll', '_$jR', '_$d5', '_$av', '_$ah', '_$mg', '_$ma', '_$c7'].forEach(k => {
  if (more[k] && more[k].type === 'array' && more[k].val) sandbox[k] = parseArr(more[k].val);
});

// 输入
sandbox.$_ts = { scj: inputs.scj, aebi: inputs.aebi, cd: inputs.cd || '', nsd: inputs.nsd || 0, cp: {}, jf: {}, lcd: '' };

vm.createContext(sandbox);

console.log('[开始] 执行完整表 VM...');
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