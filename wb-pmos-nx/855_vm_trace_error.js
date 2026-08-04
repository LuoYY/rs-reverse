/**
 * 855_vm_trace_error.js
 * 用 vm 逐行追踪错误：在 IIFE 执行前注入日志，定位 _\$a2 何时变 undefined
 * 关键：错误 reading '88'，需确认是 _\$oU 还是 _\$a2 的问题
 * 方法：在 IIFE 中注入 _\$a2/_\$oU 的检查（在 opcode 227 前）
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 在 IIFE 靠近 opcode 204/227 的地方注入日志
// opcode 204@255267 赋值 _\$a2=window
// opcode 227@255647 读 _\$a2
// 在 opcode 204 后注入 console.log(typeof _$a2)
// 在 opcode 227 前注入 console.log(typeof _$a2, typeof _$oU)

// 找 opcode 204 赋值位置
const a2win = body.indexOf('_\$a2=window;');
// 在它后面加日志
const log1 = `console.log('[trace] opcode204后 _$a2:', typeof _$a2, '_$a2===window:', _$a2===window);`;
const injected1 = body.substring(0, a2win + 12) + log1 + body.substring(a2win + 12);

// 找 opcode 227 读取位置（_$a2[）
// 在 227 分支前加日志
const a2read = injected1.indexOf('_$a2[_$oU[88]]');
const log2 = `console.log('[trace] opcode227前 _$a2:', typeof _$a2, '_$oU:', typeof _$oU, '_$oU[88]:', _$oU && _$oU[88]);`;
const injected2 = injected1.substring(0, a2read) + log2 + injected1.substring(a2read);

console.log('已注入 tracing 日志');
fs.writeFileSync('/tmp/nx_vm_body_trace.js', injected2);

// 构建 sandbox（简化）
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  document: { cookie: '', createElement: () => ({}), getElementById: () => null, addEventListener: () => {}, body: { appendChild: () => {} } },
  navigator: { userAgent: 'Mozilla/5.0', platform: 'MacIntel', language: 'zh-CN', hardwareConcurrency: 8, maxTouchPoints: 0, webdriver: false, cookieEnabled: true, plugins: [], mimeTypes: [] },
  location: { href: '', protocol: 'https:', host: '', hostname: '', pathname: '/', search: '', hash: '' },
  screen: { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24 },
  history: { length: 1, pushState: () => {}, replaceState: () => {} },
  innerWidth: 1920, innerHeight: 1080, outerWidth: 1920, outerHeight: 1080,
  devicePixelRatio: 2, addEventListener: () => {}, getComputedStyle: () => ({}),
  performance: { now: () => Date.now() }, localStorage: { getItem: () => null, setItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  fetch: () => Promise.reject(new Error('fetch')), XMLHttpRequest: class {}, WebSocket: class {}, DOMParser: class {},
  AudioContext: class {}, CanvasRenderingContext2D: class {}, matchMedia: () => ({ matches: false }),
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;
sandbox.frames = sandbox;

// VM 表
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
sandbox._$a2 = sandbox;
sandbox._$oU = tables['_$oU'].val;
sandbox._$b1 = tables['_$b1'].val;
sandbox._$lc = tables['_$lc'].val;
sandbox._$mD = tables['_$mD'].val;
sandbox._$k0 = tables['_$k0'].val;
sandbox._$bk = tables['_$bk'].val;
sandbox._$ez = tables['_$ez'].val;
sandbox._$pL = tables['_$pL'].val;

// 输入
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
sandbox.$_ts = { scj: inputs.scj, aebi: inputs.aebi, cd: inputs.cd || '', nsd: inputs.nsd || 0, cp: {}, jf: {}, lcd: '' };

vm.createContext(sandbox);

console.log('[开始] 追踪执行...');
try {
  vm.runInContext(injected2, sandbox, { timeout: 30000 });
  console.log('[完成]');
} catch (e) {
  console.error('[失败]', e.message);
}