/**
 * 922_vm_full_tables.js
 * 用完整 196 表（_$oU/_\$f$/_\$oP/_\$lC/_\$ll/_\$b1/_\$lc）+ IIFE 环境注入运行 VM
 * 关键：这些表是 opcode 的字符串索引表，值必须精确匹配浏览器
 */
const fs = require('fs');
const vm = require('vm');

// 读取原始 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 注入 IIFE 开头的所有表 + 环境
const inject = `var window = globalThis;
var self = globalThis;
var top = globalThis;
var parent = globalThis;
var frames = globalThis;
var document = globalThis.document;
var navigator = globalThis.navigator;
var screen = globalThis.screen;
var location = globalThis.location;
var history = globalThis.history;
var _$a2 = globalThis;
var _$oU = globalThis._\$oU;
var _$b1 = globalThis._\$b1;
var _$lc = globalThis._\$lc;
var _$oP = globalThis._\$oP;
var _$f$ = globalThis._\$f$;
var _$lC = globalThis._\$lC;
var _$ll = globalThis._\$ll;
var _$k0 = globalThis._\$k0;
`;
const braceIdx = body.indexOf('{');
const injected = body.substring(0, braceIdx + 1) + inject + body.substring(braceIdx + 1);
fs.writeFileSync('/tmp/nx_vm_body_full.js', injected);
console.log('已生成 body_full（完整表 + 环境注入）');

// 读取表
const tables196 = JSON.parse(fs.readFileSync('/tmp/nx_tables_196_merged.json', 'utf8'));
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

// 完整表
sandbox._$a2 = sandbox;
sandbox._$oU = tables196._$oU;
sandbox._$b1 = tables196._$b1;
sandbox._$lc = tables196._$lc;
sandbox._$oP = tables196._$oP;
sandbox._$f$ = tables196._$f$;
sandbox._$lC = tables196._$lC;
sandbox._$ll = tables196._$ll;
sandbox._$k0 = tables['_$k0'].val;

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