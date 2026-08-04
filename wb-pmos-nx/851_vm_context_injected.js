/**
 * 851_vm_context_injected.js
 * 用 vm.createContext + 注入版 IIFE（含 var _$a2 = globalThis 等）
 * 关键：vm context 中 globalThis 指向 sandbox，注入的 var 有明确值
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE（849 生成的，含 var window/document/_$a2 等）
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 读取捕获的表
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 构建 sandbox
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Buffer, process,
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  URL, URLSearchParams, Blob, Promise, Error, TypeError, RangeError, SyntaxError,
};

// 浏览器环境
sandbox.document = {
  cookie: '', createElement: () => ({}), createElementNS: () => ({}),
  getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null,
  querySelectorAll: () => [], body: { appendChild: () => {}, style: {} },
  documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {},
  createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' },
  readyState: 'complete', title: '', hidden: false, visibilityState: 'visible',
  cookieEnabled: true, referrer: '', charset: 'utf-8', defaultView: null,
};
sandbox.navigator = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true,
  hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.',
  appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  cookieEnabled: true, plugins: [], mimeTypes: [], product: 'Gecko', productSub: '20030107',
  appName: 'Netscape', appCodeName: 'Mozilla',
};
sandbox.location = { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {}, replace: () => {}, assign: () => {} };
sandbox.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' }, availTop: 0, availLeft: 0, top: 0, left: 0 };
sandbox.history = { length: 1, state: null, pushState: () => {}, replaceState: () => {}, back: () => {}, forward: () => {} };
sandbox.innerWidth = 1920; sandbox.innerHeight = 1080; sandbox.outerWidth = 1920; sandbox.outerHeight = 1080;
sandbox.screenX = 0; sandbox.screenY = 0; sandbox.pageXOffset = 0; sandbox.pageYOffset = 0;
sandbox.scrollX = 0; sandbox.scrollY = 0; sandbox.devicePixelRatio = 2;
sandbox.origin = 'https://pmos.nx.sgcc.com.cn:10443';
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {}; sandbox.dispatchEvent = () => {};
sandbox.getComputedStyle = () => ({}); sandbox.requestAnimationFrame = (cb) => setTimeout(cb, 16);
sandbox.cancelAnimationFrame = (id) => clearTimeout(id);
sandbox.performance = { now: () => Date.now(), timing: { navigationStart: Date.now() - 1000 } };
sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
sandbox.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
sandbox.crypto = { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, subtle: {} };
sandbox.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
sandbox.atob = (s) => Buffer.from(s, 'base64').toString('binary');
sandbox.fetch = () => Promise.reject(new Error('fetch not available'));
sandbox.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} };
sandbox.WebSocket = class {};
sandbox.DOMParser = class { parseFromString() { return { getElementById: () => null }; } };
sandbox.AudioContext = class {};
sandbox.CanvasRenderingContext2D = class {};
sandbox.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });

// 引用循环
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;
sandbox.frames = sandbox;

// VM 表
sandbox._$a2 = sandbox;
sandbox._$mD = tables['_$mD'].val;
sandbox._$k0 = tables['_$k0'].val;
sandbox._$oU = tables['_$oU'].val;
sandbox._$b1 = tables['_$b1'].val;
sandbox._$lc = tables['_$lc'].val;
sandbox._$bk = tables['_$bk'].val;
sandbox._$ez = tables['_$ez'].val;
sandbox._$pL = tables['_$pL'].val;

// 输入
sandbox.$_ts = {
  scj: inputs.scj,
  aebi: inputs.aebi,
  cd: inputs.cd || '',
  nsd: inputs.nsd || 0,
  cp: {},
  jf: {},
  lcd: '',
};

// 创建 context
vm.createContext(sandbox);

// 调试：在 IIFE 执行前检查 sandbox._$a2
console.log('[debug] sandbox._$a2 === sandbox:', sandbox._$a2 === sandbox);
console.log('[debug] sandbox.window === sandbox:', sandbox.window === sandbox);
console.log('[debug] sandbox.document:', typeof sandbox.document);

console.log('[开始] vm context + 注入版执行 IIFE...');
try {
  vm.runInContext(body, sandbox, { timeout: 30000 });
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