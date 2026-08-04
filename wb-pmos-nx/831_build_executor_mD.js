/**
 * 831_build_executor_mD.js
 * 用捕获的 _$mD 签名构建完整 Node 执行器
 * 关键：_\$mD 是 VM 全局对象表（69 项，38 非 null）
 * 提供这些对象的 Node 等价 + 捕获的 aebi 输入
 */
const fs = require('fs');

// 读取 _$mD 签名
const mDSig = JSON.parse(fs.readFileSync('/tmp/nx_mD_sig.json', 'utf8'));
const sig = JSON.parse(mDSig.mD);

// 读取输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 构建 _$mD 全局表
const mD = new Array(69).fill(null);
sig.forEach(x => {
  if (x.t === 'null' || x.t === 'undefined') return;
  if (x.t === 'function') {
    // 用 Node 原生替代
    const map = {
      floor: Math.floor, substring: String.prototype.substring, join: Array.prototype.join,
      split: String.prototype.split, indexOf: String.prototype.indexOf, round: Math.round,
      ceil: Math.ceil, toLowerCase: String.prototype.toLowerCase, abs: Math.abs,
      concat: Array.prototype.concat, min: Math.min, parse: JSON.parse, toString: String.prototype.toString,
      toUpperCase: String.prototype.toUpperCase, slice: Array.prototype.slice,
      clearInterval: clearInterval, match: String.prototype.match, lastIndexOf: String.prototype.lastIndexOf,
      pow: Math.pow, charAt: String.prototype.charAt, replace: String.prototype.replace,
      log: Math.log, appendChild: () => {}, removeChild: () => {},
      createElement: () => ({}), WebSocket: class {}, DOMParser: class {}, fetch: () => Promise.resolve({}),
    };
    mD[x.i] = map[x.fn] || (() => {});
  } else if (x.t === 'object') {
    // 构造空对象
    mD[x.i] = {};
    if (x.c === 'Array') mD[x.i] = [];
    if (x.fn === '...') {}
  } else {
    mD[x.i] = x.v;
  }
});

// 特殊处理 [18] = $_ts
mD[18] = {
  nsd: inputs.nsd || 0,
  cd: inputs.cd || '',
  lcd: "",
  cp: {},
  jf: {},
  aebi: inputs.aebi,
  scj: inputs.scj,
};

// 生成执行器
const runner = `
// VM 执行器（Node 环境模拟，含 _$mD 全局表）
const fs = require('fs');

// 环境 stub
const _document = { cookie: '', createElement: () => ({}), createElementNS: () => ({}), getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], body: { appendChild: () => {}, style: {} }, documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {}, createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' } };
const _navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.', appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', cookieEnabled: true, plugins: [], mimeTypes: [] };
const _location = { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {}, replace: () => {}, assign: () => {} };
const _screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
const _history = { length: 1, state: null, pushState: () => {}, replaceState: () => {}, back: () => {}, forward: () => {} };

// 全局对象
const _ts = {};
globalThis.$_ts = _ts;
globalThis.window = globalThis;
globalThis.document = _document;
globalThis.navigator = _navigator;
globalThis.location = _location;
globalThis.screen = _screen;
globalThis.history = _history;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
globalThis.frames = globalThis;

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

// 捕获的 _$mD 全局表
const mD = ${JSON.stringify(mD)};

// 设置输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
_ts.scj = inputs.scj;
_ts.aebi = inputs.aebi;
if (inputs.cd) _ts.cd = inputs.cd;
if (inputs.nsd) _ts.nsd = inputs.nsd;
_ts.cp = {};
_ts.jf = {};
_ts.lcd = "";

// 在 IIFE 作用域提供 _$mD
// 注意：IIFE 引用 _$mD 是全局，但 eval JS 中未定义（由前置 JS 定义）
// 我们需在 eval 前设置 globalThis._$mD
globalThis._$mD = mD;

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

fs.writeFileSync('/tmp/nx_vm_executor_run.js', runner);
console.log('已生成执行器 /tmp/nx_vm_executor_run.js');