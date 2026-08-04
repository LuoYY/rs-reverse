/**
 * 850_vm_context.js
 * 用 vm.createContext 运行 IIFE（真正的全局作用域）
 * 关键：IIFE 内 window/document/navigator 等引用解析到 sandbox 全局
 * 这是 Node 模拟浏览器环境最可靠的方式
 */
const fs = require('fs');
const vm = require('vm');

// 读取原始 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 读取捕获的表
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 构建 sandbox（浏览器环境模拟）
const sandbox = {
  // 基本全局
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Buffer, process, require: (m) => { if (m === 'fs') return fs; throw new Error('no require: ' + m); },
  // 浏览器环境
  window: null, self: null, top: null, parent: null, frames: null,
  document: {
    cookie: '', createElement: () => ({}), createElementNS: () => ({}),
    getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null,
    querySelectorAll: () => [], body: { appendChild: () => {}, style: {} },
    documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {},
    createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' },
    readyState: 'complete', title: '', hidden: false, visibilityState: 'visible',
    cookieEnabled: true, referrer: '', charset: 'utf-8', defaultView: null,
  },
  navigator: {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true,
    hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    cookieEnabled: true, plugins: [], mimeTypes: [], product: 'Gecko', productSub: '20030107',
    appName: 'Netscape', appCodeName: 'Mozilla',
  },
  location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {}, replace: () => {}, assign: () => {} },
  screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' }, availTop: 0, availLeft: 0, top: 0, left: 0 },
  history: { length: 1, state: null, pushState: () => {}, replaceState: () => {}, back: () => {}, forward: () => {} },
  innerWidth: 1920, innerHeight: 1080, outerWidth: 1920, outerHeight: 1080,
  screenX: 0, screenY: 0, pageXOffset: 0, pageYOffset: 0, scrollX: 0, scrollY: 0,
  devicePixelRatio: 2, origin: 'https://pmos.nx.sgcc.com.cn:10443',
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {},
  getComputedStyle: () => ({}), requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  performance: { now: () => Date.now(), timing: { navigationStart: Date.now() - 1000 } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, subtle: {} },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  fetch: () => Promise.reject(new Error('fetch not available')),
  XMLHttpRequest: class { open() {} send() {} setRequestHeader() {} },
  WebSocket: class {}, DOMParser: class { parseFromString() { return { getElementById: () => null }; } },
  AudioContext: class {}, CanvasRenderingContext2D: class {},
  matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  URL, URLSearchParams, Blob, Promise, Error, TypeError, RangeError, SyntaxError,
  // JSON 等通过 vm 自动提供
};

// 设置引用
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;
sandbox.frames = sandbox;

// VM 表（在 sandbox 全局）
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

console.log('[开始] vm context 执行 IIFE...');
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