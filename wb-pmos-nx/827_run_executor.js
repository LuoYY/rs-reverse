/**
 * 827_run_executor.js
 * 运行 VM 执行器：用捕获的 aebi/scj 输入，在 Node 中执行 eval JS
 * 目标：复现 base 生成（验证 VM 在 Node 中可运行）
 */
const fs = require('fs');
const path = require('path');

// 读取捕获的输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
console.log('输入字段:', Object.keys(inputs));
console.log('scj:', JSON.stringify(inputs.scj).substring(0, 200));
console.log('aebi 数组数:', inputs.aebi.length);
console.log('aebi[0] len:', inputs.aebi[0].length, 'head:', inputs.aebi[0].slice(0, 20).join(','));
console.log('aebi[1] len:', inputs.aebi[1].length);
console.log('aebi[2] len:', inputs.aebi[2].length);
console.log('aebi[3] len:', inputs.aebi[3].length);
console.log('aebi[4] len:', inputs.aebi[4].length);

// 读取 eval JS
const evalSrc = fs.readFileSync('/tmp/nx_base_generator.js', 'utf8');
const iife = evalSrc.substring(0, evalSrc.indexOf('})($'));
console.log('IIFE 长度:', iife.length);

// 组装完整执行器
const executor = `
// VM 执行器（Node 环境模拟）
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 环境 stub
const _global = globalThis;
const _windowProps = {};
const _document = { cookie: '', createElement: () => ({ style: {}, getContext: () => null, setAttribute: () => {}, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }), appendChild: () => {}, removeChild: () => {}, addEventListener: () => {}, removeEventListener: () => {} }), cookieEnabled: true, referrer: '', title: '', URL: '', location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '', search: '', hash: '' }, body: { appendChild: () => {}, style: {} }, documentElement: { style: {} }, getElementById: () => null, getElementsByTagName: () => [], querySelector: () => null, querySelectorAll: () => [], createDocumentFragment: () => ({}) };
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
globalThis.window = globalThis;

// 提供 $_ts 引用
globalThis.$_ts = _ts;

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

// 设置 $_ts.scj / $_ts.aebi
_ts.scj = inputs.scj;
_ts.aebi = inputs.aebi;

// 执行 IIFE
console.log('[开始] 执行 VM IIFE...');
try {
  const result = eval(\`${iife.replace(/\\`/g, '\\\\`').replace(/\\\$/g, '\\$')}\`);
  console.log('[完成] VM 执行成功');
  console.log('[ts] $_ts 字段:', Object.keys(_ts));
  // 输出 base 相关
  if (_ts.aebi) console.log('[ts.aebi]', JSON.stringify(_ts.aebi).substring(0, 200));
  if (_ts.lcd) console.log('[ts.lcd]', JSON.stringify(_ts.lcd).substring(0, 200));
  if (_ts.__base) console.log('[ts.__base]', JSON.stringify(_ts.__base).substring(0, 200));
  // 保存结果
  fs.writeFileSync('/tmp/nx_vm_result.json', JSON.stringify({ tsKeys: Object.keys(_ts), ts: _ts }, null, 1));
  console.log('已保存 /tmp/nx_vm_result.json');
} catch (e) {
  console.error('[失败]', e.message);
  console.error(e.stack);
  fs.writeFileSync('/tmp/nx_vm_error.txt', e.stack || e.message);
}
`;

fs.writeFileSync('/tmp/nx_vm_executor_run.js', executor);
console.log('已生成执行器 run 脚本');