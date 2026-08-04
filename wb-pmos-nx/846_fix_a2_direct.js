/**
 * 846_fix_a2_direct.js
 * 直接设置 _\$a2 = globalThis（window 引用），绕过 globalThis._\$a2 传递问题
 * 关键：_\$a2 是 window 别名，opcode 227 读 _\$a2['document']
 */
const fs = require('fs');

// 读取 IIFE body
let body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 注入：var _$a2 = globalThis（直接赋值，不依赖 globalThis._\$a2）
const inject = `var _$a2 = globalThis;
var _\$mD = globalThis._\$mD;
var _\$k0 = globalThis._\$k0;
var _\$oU = globalThis._\$oU;
var _\$b1 = globalThis._\$b1;
var _\$lc = globalThis._\$lc;
var _\$bk = globalThis._\$bk;
var _\$ez = globalThis._\$ez;
var _\$pL = globalThis._\$pL;
var _\$e5 = globalThis._\$e5;
`;

const braceIdx = body.indexOf('{');
const injected = body.substring(0, braceIdx + 1) + inject + body.substring(braceIdx + 1);
fs.writeFileSync('/tmp/nx_vm_body_injected.js', injected);
console.log('已生成注入版 body（_$a2 = globalThis 直接赋值）');

// 读取执行器模板（用 839 的 GLOBAL_TABLES 部分）
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));

// 生成执行器
const setup = `
const fs = require('fs');
const _document = { cookie: '', createElement: () => ({}), createElementNS: () => ({}), getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], body: { appendChild: () => {}, style: {} }, documentElement: { style: {} }, addEventListener: () => {}, removeEventListener: () => {}, createEvent: () => ({ initEvent: () => {} }), location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' }, readyState: 'complete', title: '', hidden: false, visibilityState: 'visible', cookieEnabled: true, referrer: '', charset: 'utf-8', defaultView: null };
const _navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.', appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', cookieEnabled: true, plugins: [], mimeTypes: [], product: 'Gecko', productSub: '20030107', appName: 'Netscape', appCodeName: 'Mozilla' };
const _location = { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {}, replace: () => {}, assign: () => {} };
const _screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' }, availTop: 0, availLeft: 0, top: 0, left: 0 };
const _history = { length: 1, state: null, pushState: () => {}, replaceState: () => {}, back: () => {}, forward: () => {} };
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
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
globalThis.fetch = () => Promise.reject(new Error('fetch not available'));
globalThis.XMLHttpRequest = class { open() {} send() {} setRequestHeader() {} };
globalThis.WebSocket = class {};
globalThis.DOMParser = class { parseFromString() { return { getElementById: () => null }; } };
globalThis.AudioContext = class {};
globalThis.CanvasRenderingContext2D = class {};
globalThis.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
`;

// 全局表
const GLOBAL_TABLES = `
globalThis._\$a2 = globalThis;
globalThis._\$mD = ${JSON.stringify(tables['_$mD'].val)};
globalThis._\$k0 = ${JSON.stringify(tables['_$k0'].val)};
globalThis._\$oU = ${JSON.stringify(tables['_$oU'].val)};
globalThis._\$b1 = ${JSON.stringify(tables['_$b1'].val)};
globalThis._\$lc = ${JSON.stringify(tables['_$lc'].val)};
globalThis._\$bk = ${JSON.stringify(tables['_$bk'].val)};
globalThis._\$ez = ${JSON.stringify(tables['_$ez'].val)};
globalThis._\$pL = ${JSON.stringify(tables['_$pL'].val)};
`;

// 输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

const runner = `
${setup}
${GLOBAL_TABLES}
console.log('[debug] globalThis._\$a2 类型:', typeof globalThis._\$a2, '=== globalThis:', globalThis._\$a2 === globalThis);
_ts.scj = ${JSON.stringify(inputs.scj)};
_ts.aebi = ${JSON.stringify(inputs.aebi)};
_ts.cd = ${JSON.stringify(inputs.cd || '')};
_ts.nsd = ${JSON.stringify(inputs.nsd || 0)};
_ts.cp = {};
_ts.jf = {};
_ts.lcd = "";
console.log('[开始] 执行注入版 VM IIFE...');
try {
  eval(${JSON.stringify(injected)});
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

fs.writeFileSync('/tmp/nx_vm_executor_injected.js', runner);
console.log('已生成注入版执行器 /tmp/nx_vm_executor_injected.js');