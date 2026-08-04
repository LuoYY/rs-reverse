/**
 * 837_run_executor_exact.js
 * 用精确 _$mD 运行 VM 执行器
 * 关键：将精确 _$mD 注入执行器，替换之前的签名 stub
 */
const fs = require('fs');

// 读取精确 _$mD
const mD = JSON.parse(fs.readFileSync('/tmp/nx_mD_exact.json', 'utf8'));

// 读取输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 读取现有执行器并替换 mD
let runner = fs.readFileSync('/tmp/nx_vm_executor_run.js', 'utf8');

// 替换 mD 定义
const mDStart = runner.indexOf('const mD = ');
const mDEnd = runner.indexOf(';', mDStart);
if (mDStart >= 0) {
  runner = runner.substring(0, mDStart) + 'const mD = ' + JSON.stringify(mD).replace(/null/g, 'null') + ';' + runner.substring(mDEnd + 1);
}

// 特殊处理：函数无法 JSON 序列化（mD_exact 里函数变成 null）
// 需要重新生成执行器（含函数定义）
// 从 834 代码构建完整执行器
const fnMap = {
  floor: 'Math.floor', substring: 'String.prototype.substring', join: 'Array.prototype.join',
  split: 'String.prototype.split', indexOf: 'String.prototype.indexOf', round: 'Math.round',
  ceil: 'Math.ceil', toLowerCase: 'String.prototype.toLowerCase', abs: 'Math.abs',
  concat: 'Array.prototype.concat', min: 'Math.min', parse: 'JSON.parse', toString: 'String.prototype.toString',
  toUpperCase: 'String.prototype.toUpperCase', slice: 'Array.prototype.slice',
  clearInterval: 'clearInterval', match: 'String.prototype.match',
  lastIndexOf: 'String.prototype.lastIndexOf', pow: 'Math.pow', charAt: 'String.prototype.charAt',
  replace: 'String.prototype.replace', log: 'Math.log', max: 'Math.max',
  appendChild: '() => ({})', removeChild: '() => ({})', createElement: '() => ({})',
  addEventListener: '() => {}', removeEventListener: '() => {}', dispatchEvent: '() => {}',
  setAttribute: '() => {}', getAttribute: '() => null', querySelector: '() => null',
  open: '() => {}', send: '() => {}', setRequestHeader: '() => {}',
  getComputedStyle: '() => ({})', getBoundingClientRect: '() => ({top:0,left:0,width:0,height:0})',
  setTimeout: 'setTimeout', setInterval: 'setInterval', clearTimeout: 'clearTimeout',
  push: 'Array.prototype.push', splice: 'Array.prototype.splice', pop: 'Array.prototype.pop',
  shift: 'Array.prototype.shift', unshift: 'Array.prototype.unshift',
  reverse: 'Array.prototype.reverse', sort: 'Array.prototype.sort',
  forEach: 'Array.prototype.forEach', map: 'Array.prototype.map', filter: 'Array.prototype.filter',
  reduce: 'Array.prototype.reduce', some: 'Array.prototype.some', every: 'Array.prototype.every',
  find: 'Array.prototype.find', includes: 'Array.prototype.includes',
  charCodeAt: 'String.prototype.charCodeAt', fromCharCode: 'String.fromCharCode',
  trim: 'String.prototype.trim', startsWith: 'String.prototype.startsWith', endsWith: 'String.prototype.endsWith',
  getPrototypeOf: 'Object.getPrototypeOf', defineProperty: 'Object.defineProperty',
  getOwnPropertyDescriptor: 'Object.getOwnPropertyDescriptor',
  keys: 'Object.keys', values: 'Object.values', entries: 'Object.entries',
  stringify: 'JSON.stringify', decodeURIComponent: 'decodeURIComponent', encodeURIComponent: 'encodeURIComponent',
  parseFloat: 'parseFloat', parseInt: 'parseInt', isNaN: 'isNaN', isFinite: 'isFinite',
  now: 'Date.now', getTime: 'Date.prototype.getTime', getFullYear: 'Date.prototype.getFullYear',
  getMonth: 'Date.prototype.getMonth', getDate: 'Date.prototype.getDate',
  getDay: 'Date.prototype.getDay', getHours: 'Date.prototype.getHours',
  getMinutes: 'Date.prototype.getMinutes', getSeconds: 'Date.prototype.getSeconds',
  getMilliseconds: 'Date.prototype.getMilliseconds',
  getTimezoneOffset: 'Date.prototype.getTimezoneOffset',
  toISOString: 'Date.prototype.toISOString', toJSON: 'Date.prototype.toJSON',
  random: 'Math.random', sqrt: 'Math.sqrt',
};

// 构建 mD 表达式
const mDExpr = [];
const mD_val = JSON.parse(fs.readFileSync('/tmp/nx_mD_exact.json', 'utf8'));
// 用 mD_val（可能是 null 化的）重新构建
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const sig = tables['_$mD'].val;
sig.forEach((v, i) => {
  if (typeof v === 'string') {
    if (v === 'undefined' || v === 'null') { mDExpr[i] = 'null'; return; }
    if (v.startsWith('fn:')) {
      const name = v.substring(3);
      const impl = fnMap[name] || '() => undefined';
      mDExpr[i] = impl;
    } else if (v.startsWith('obj:')) { mDExpr[i] = '({})'; }
    else if (v.startsWith('n:')) { mDExpr[i] = v.substring(2); }
    else if (v.startsWith('s:')) { mDExpr[i] = JSON.stringify(v.substring(2)); }
    else if (v.startsWith('b:')) { mDExpr[i] = v.substring(2) === 'true' ? 'true' : 'false'; }
    else {
      const n = parseFloat(v);
      mDExpr[i] = isNaN(n) ? JSON.stringify(v) : n;
    }
  } else {
    mDExpr[i] = JSON.stringify(v);
  }
});
const mDCode = '[' + mDExpr.join(',') + ']';

// 生成完整执行器
const runnerCode = `
// VM 执行器（Node 环境，精确 _$mD）
const fs = require('fs');

// 环境 stub
const _document = { cookie: '', createElement: () => ({}), createElementNS: () => ({}), getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], body: { appendChild: () => {}, style: {} }, documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {}, createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' }, readyState: 'complete', title: '', hidden: false, visibilityState: 'visible', cookieEnabled: true, referrer: '', charset: 'utf-8', defaultView: null };
const _navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.', appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', cookieEnabled: true, plugins: [], mimeTypes: [], product: 'Gecko', productSub: '20030107', appName: 'Netscape', appCodeName: 'Mozilla' };
const _location = { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {}, replace: () => {}, assign: () => {} };
const _screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' }, availTop: 0, availLeft: 0, top: 0, left: 0 };
const _history = { length: 1, state: null, pushState: () => {}, replaceState: () => {}, back: () => {}, forward: () => {} };

// 全局对象
const _ts = {};
globalThis.$_ts = _ts;
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
globalThis.frames = globalThis;
globalThis.document = _document;
globalThis.navigator = _navigator;
globalThis.location = _location;
globalThis.screen = _screen;
globalThis.history = _history;
globalThis.innerWidth = 1920;
globalThis.innerHeight = 1080;
globalThis.outerWidth = 1920;
globalThis.outerHeight = 1080;
globalThis.screenX = 0;
globalThis.screenY = 0;
globalThis.pageXOffset = 0;
globalThis.pageYOffset = 0;
globalThis.scrollX = 0;
globalThis.scrollY = 0;
globalThis.devicePixelRatio = 2;
globalThis.origin = 'https://pmos.nx.sgcc.com.cn:10443';

// 基础 API
globalThis.console = console;
globalThis.Date = Date;
globalThis.Math = Math;
globalThis.JSON = JSON;
globalThis.Object = Object;
globalThis.Array = Array;
globalThis.String = String;
globalThis.Number = Number;
globalThis.Boolean = Boolean;
globalThis.RegExp = RegExp;
globalThis.parseInt = parseInt;
globalThis.parseFloat = parseFloat;
globalThis.isNaN = isNaN;
globalThis.isFinite = isFinite;
globalThis.encodeURIComponent = encodeURIComponent;
globalThis.decodeURIComponent = decodeURIComponent;
globalThis.encodeURI = encodeURI;
globalThis.decodeURI = decodeURI;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;
globalThis.setInterval = setInterval;
globalThis.clearInterval = clearInterval;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => {};
globalThis.getComputedStyle = () => ({});
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.performance = { now: () => Date.now(), timing: { navigationStart: Date.now() - 1000 } };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
globalThis.crypto = { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, subtle: {} };
globalThis.URL = URL;
globalThis.URLSearchParams = URLSearchParams;
globalThis.Blob = Blob;
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.fetch = () => Promise.reject(new Error('fetch not available'));
globalThis.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} };
globalThis.WebSocket = class {};
globalThis.DOMParser = class { parseFromString() { return { getElementById: () => null }; } };
globalThis.AudioContext = class {};
globalThis.CanvasRenderingContext2D = class {};
globalThis.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
globalThis.Request = class {};
globalThis.Response = class {};
globalThis.Headers = class {};
globalThis.MessageChannel = class {};
globalThis.Promise = Promise;

// 提供 VM 表
globalThis._\$mD = ${mDCode};
globalThis._\$a2 = globalThis;
globalThis._\$k0 = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$k0'].val)};
globalThis._\$oU = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$oU'].val)};
globalThis._\$b1 = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$b1'].val)};
globalThis._\$lc = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$lc'].val)};
globalThis._\$bk = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$bk'].val)};
globalThis._\$ez = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$ez'].val)};
globalThis._\$pL = ${JSON.stringify(JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json','utf8'))['_$pL'].val)};

// 设置输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
_ts.scj = inputs.scj;
_ts.aebi = inputs.aebi;
if (inputs.cd) _ts.cd = inputs.cd;
if (inputs.nsd) _ts.nsd = inputs.nsd;
_ts.cp = {};
_ts.jf = {};
_ts.lcd = "";

console.log('[开始] 执行 VM IIFE...');
try {
  require('/tmp/nx_vm_body.js');
  console.log('[完成] VM 执行成功');
  console.log('[ts] $_ts 字段:', Object.keys(_ts));
  if (_ts.lcd) console.log('[ts.lcd]', JSON.stringify(_ts.lcd).substring(0, 200));
  if (_ts.aebi) console.log('[ts.aebi] len:', _ts.aebi.length);
  fs.writeFileSync('/tmp/nx_vm_result.json', JSON.stringify({ tsKeys: Object.keys(_ts), ts: _ts }, null, 1));
  console.log('已保存 /tmp/nx_vm_result.json');
} catch (e) {
  console.error('[失败]', e.message);
  console.error(e.stack);
  fs.writeFileSync('/tmp/nx_vm_error.txt', e.stack || e.message);
}
`;

fs.writeFileSync('/tmp/nx_vm_executor_run.js', runnerCode);
console.log('已生成精确执行器，mD 长度:', mDExpr.length);