/**
 * 857_vm_trace_ou.js
 * 追踪 _\$oU 何时变 undefined
 * 关键：注入的 var _\$oU = globalThis._\$oU（@397）
 * 但 opcode 227 前 _\$oU undefined
 * 说明 opcode 725 赋值 _\$oU=_$kB[0] 已执行（_$kB[0] 是 undefined？）
 * 或注入的 _\$oU 被覆盖
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 注入追踪：在注入的 var _\$oU 后 + opcode 725 后 + opcode 227 前
// 1. 注入 var 后
const injectVar = body.indexOf('var _\$oU = globalThis._\$oU;');
const log1 = `console.log('[trace] 注入var _\$oU后:', typeof _\$oU, _\$oU && _\$oU[88]);`;
const t1 = body.substring(0, injectVar + 32) + log1 + body.substring(injectVar + 32);

// 2. opcode 725 赋值后
const op725 = t1.indexOf('_\$oU=_$kB[0];');
const log2 = `console.log('[trace] opcode725 _\$oU=_$kB[0] 后:', typeof _\$oU, '_$kB:', typeof _$kB, '_$kB[0]:', _$kB && _$kB[0]);`;
const t2 = t1.substring(0, op725 + 12) + log2 + t1.substring(op725 + 12);

// 3. opcode 227 前
const a2read = t2.indexOf('_$a2[_$oU[88]]');
const log3 = `console.log('[trace] opcode227前 _\$oU:', typeof _\$oU, '_$oU[88]:', _\$oU && _\$oU[88]);`;
const t3 = t2.substring(0, a2read) + log3 + t2.substring(a2read);

console.log('已注入追踪');
fs.writeFileSync('/tmp/nx_vm_body_trace2.js', t3);

// 构建 sandbox（同 855）
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
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
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox; sandbox.frames = sandbox;

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

const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
sandbox.$_ts = { scj: inputs.scj, aebi: inputs.aebi, cd: inputs.cd || '', nsd: inputs.nsd || 0, cp: {}, jf: {}, lcd: '' };

vm.createContext(sandbox);

console.log('[开始] 追踪执行...');
try {
  vm.runInContext(t3, sandbox, { timeout: 30000 });
  console.log('[完成]');
} catch (e) {
  console.error('[失败]', e.message);
}