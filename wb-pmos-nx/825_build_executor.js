/**
 * 825_build_executor.js
 * 组装 VM 执行器：从 eval JS 提取完整 VM 解释器 + 依赖
 * 关键：eval JS = (function(_$$5,_$lP){...})(_$ts.scj,$_ts.aebi)
 * 提取整个 IIFE 体作为 VM 执行器，在 Node 中用 stub 环境运行
 */
const fs = require('fs');
const path = require('path');

const EVAL_JS = '/tmp/nx_base_generator.js';
const OUT = '/tmp/nx_vm_executor.js';

function extractIIFE(src) {
  // 提取第一个 IIFE 体（从 (function 到 ...})）
  const start = src.indexOf('(function');
  // 找到匹配的关闭括号
  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
    if (depth === 0) { end = i + 1; break; }
  }
  return src.substring(start, end);
}

// 读取 eval JS（含 2 个 IIFE，取第一个）
const src = fs.readFileSync(EVAL_JS, 'utf8');
const iife = extractIIFE(src);
console.log('IIFE 长度:', iife.length);

// 关键：IIFE 尾部是 })(_$ts.scj,$_ts.aebi)
// 在 Node 中，需要提供 $_ts.scj 和 $_ts.aebi
// 但 Node 中没有 $_ts，所以需要包装
// 方案：把 IIFE 改为接收参数，用 Node 的全局替换
// 即：把 })($ts.scj,$ts.aebi) 改为 })(scj, aebi) 并传入

// 解析 IIFE 尾部
const tailIdx = iife.lastIndexOf('})(');
const body = iife.substring(0, tailIdx + 2); // 到 })
const args = iife.substring(tailIdx + 3, iife.length - 1); // scj, aebi
console.log('IIFE 参数:', args.substring(0, 100));

// 组装 Node 执行器
const executor = `
// VM 执行器（从 eval JS 提取）
// 输入：scj（全局数据）, aebi（明文 basearr）
// 输出：VM 执行结果（base 或其他）

// 环境 stub
const _global = globalThis;
const _window = globalThis;
const _document = { cookie: '', createElement: () => ({ style: {}, getContext: () => null, setAttribute: () => {} }), cookieEnabled: true, referrer: '', title: '', URL: '', location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '', search: '', hash: '' } };
const _navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN', 'zh'], onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, vendor: 'Google Inc.', userAgentData: undefined, appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };
const _location = { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '', reload: () => {} };
const _screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24, orientation: { type: 'landscape-primary' } };
const _history = { length: 1, state: null };

// 全局对象
const _ts = {};
globalThis._$ts = _ts;
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

// 运行 VM
function runVM(scj, aebi) {
  _ts.scj = scj;
  _ts.aebi = aebi;
  try {
    // 执行 IIFE
${iife.replace(/\)\}\(_\$ts\.scj,\$_ts\.aebi\)$/, '})()')}
    return { ts: _ts };
  } catch (e) {
    return { error: e.message, stack: e.stack };
  }
}

module.exports = { runVM };
`;

fs.writeFileSync(OUT, executor);
console.log('已保存执行器脚手架:', OUT, '长', executor.length);

// 测试：需要 scj/aebi 输入
// 从 nx_vm_inputs.json 读（824 捕获）
try {
  const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs.json', 'utf8'));
  console.log('输入文件字段:', Object.keys(inputs));
  console.log('scj:', inputs.scj ? String(inputs.scj).substring(0, 100) : 'null');
  console.log('aebi:', inputs.aebi ? String(inputs.aebi).substring(0, 100) : 'null');
} catch (e) {
  console.log('输入文件不可用:', e.message);
}