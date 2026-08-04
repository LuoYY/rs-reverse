/**
 * 834_build_executor_full.js
 * 用捕获的完整 VM 表构建 Node 执行器
 * 关键表：_$k0(423) _$mD(626) _$oU(196) _$b1(196) _$lc(196) _$bk(2553) _$ez(1532) _$pL(8)
 * 这些表是 VM 运行的基础，浏览器断点捕获
 */
const fs = require('fs');

// 读取捕获的表
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

// 解析表值（数组转回 JS 值）
function parseArr(val) {
  return val.map(v => {
    if (typeof v === 'string') {
      if (v === 'null') return null;
      if (v.startsWith('fn:')) return function () {};
      if (v.startsWith('obj:')) return {};
      if (v.startsWith('n:')) return +v.substring(2);
      if (v.startsWith('s:')) return v.substring(2);
      if (v.startsWith('b:')) return v.substring(2) === 'true';
      // 纯字符串
      return v;
    }
    return v;
  });
}

// 构建各表
const k0 = parseArr(tables['_$k0'].val);
const oU = parseArr(tables['_$oU'].val);
const b1 = parseArr(tables['_$b1'].val);
const lc = parseArr(tables['_$lc'].val);
const bk = parseArr(tables['_$bk'].val);
const ez = parseArr(tables['_$ez'].val);
const pL = tables['_$pL'].val;

// _$mD 特殊处理（全局对象表）
const mD = new Array(626).fill(null);
tables['_$mD'].val.forEach((v, i) => {
  if (typeof v === 'string') {
    if (v === 'undefined') return;
    if (v === 'null') return;
    if (v.startsWith('fn:')) {
      const name = v.substring(3);
      const map = {
        floor: () => Math.floor, substring: () => String.prototype.substring, join: () => Array.prototype.join,
        split: () => String.prototype.split, indexOf: () => String.prototype.indexOf, round: () => Math.round,
        ceil: () => Math.ceil, toLowerCase: () => String.prototype.toLowerCase, abs: () => Math.abs,
        concat: () => Array.prototype.concat, min: () => Math.min, parse: () => JSON.parse,
        toString: () => String.prototype.toString, toUpperCase: () => String.prototype.toUpperCase,
        slice: () => Array.prototype.slice, clearInterval: () => clearInterval, match: () => String.prototype.match,
        lastIndexOf: () => String.prototype.lastIndexOf, pow: () => Math.pow, charAt: () => String.prototype.charAt,
        replace: () => String.prototype.replace, log: () => Math.log, appendChild: () => () => {},
        removeChild: () => () => {}, createElement: () => () => ({}), WebSocket: () => class {}, DOMParser: () => class {}, fetch: () => () => Promise.resolve({}),
        _$aq: () => function () {}, _$ae: () => function () {},
      };
      mD[i] = map[name] ? map[name]() : (() => {});
    } else if (v.startsWith('obj:')) {
      mD[i] = {};
    } else if (v.startsWith('n:')) {
      mD[i] = +v.substring(2);
    } else if (v.startsWith('s:')) {
      mD[i] = v.substring(2);
    } else if (v.startsWith('b:')) {
      mD[i] = v.substring(2) === 'true';
    } else if (v === '4') mD[i] = 4;
    else if (v === '1') mD[i] = 1;
    else {
      const n = parseFloat(v);
      mD[i] = isNaN(n) ? v : n;
    }
  } else {
    mD[i] = v;
  }
});

// 生成执行器
const runner = `
// VM 执行器（Node 环境，完整表）
const fs = require('fs');

// 环境 stub
const _document = { cookie: '', createElement: () => ({}), createElementNS: () => ({}), getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], body: { appendChild: () => {}, style: {} }, documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {}, createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' }, readyState: 'complete', title: '', hidden: false, visibilityState: 'visible', cookieEnabled: true, referrer: '', charset: 'utf-8', defaultView: null };
const _navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.', appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', cookieEnabled: true, plugins: [], mimeTypes: [], webdriver: false, doNotTrack: null, deviceMemory: 8, product: 'Gecko', productSub: '20030107', appName: 'Netscape', appCodeName: 'Mozilla' };
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
globalThis._\$k0 = ${JSON.stringify(k0)};
globalThis._\$oU = ${JSON.stringify(oU)};
globalThis._\$b1 = ${JSON.stringify(b1)};
globalThis._\$lc = ${JSON.stringify(lc)};
globalThis._\$bk = ${JSON.stringify(bk)};
globalThis._\$ez = ${JSON.stringify(ez)};
globalThis._\$pL = ${JSON.stringify(pL)};
globalThis._\$mD = ${JSON.stringify(mD)};
// _\$a2 = window 对象（全局引用）
globalThis._\$a2 = globalThis;
// _\$e5 = 环境表
globalThis._\$e5 = ${JSON.stringify(oU)};
// _\$oN 等函数
globalThis._\$oN = function _\$oN() {};
globalThis._\$k2 = function _\$k2() {};
globalThis._\$no = function _\$no() {};
globalThis._\$c2 = function _\$c2() {};
globalThis._\$aw = function _\$aw() {};
globalThis._\$ip = function _\$ip() {};
globalThis._\$gq = function _\$gq() {};
globalThis._\$eB = function _\$eB() {};
globalThis._\$ae = function _\$ae() {};
globalThis._\$cr = function _\$cr() {};
globalThis._\$oR = function _\$oR() {};

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

fs.writeFileSync('/tmp/nx_vm_executor_run.js', runner);
console.log('已生成执行器 /tmp/nx_vm_executor_run.js');
console.log('表: k0=' + k0.length + ' oU=' + oU.length + ' b1=' + b1.length + ' lc=' + lc.length + ' bk=' + bk.length + ' ez=' + ez.length + ' pL=' + pL.length + ' mD=' + mD.length);