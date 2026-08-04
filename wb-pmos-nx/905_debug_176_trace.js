/**
 * 905_debug_176_trace.js
 * 精确追踪 reading '176' 错误（在 opcode 276 前注入检查）
 * 关键：错误在 opcode 276-280 区域，可能是 _\$mD[176] 或 _\$oU[176]
 * 但 _\$mD 只有 67 长，[176] 越界读 undefined
 * 或 _\$oU[176] 是 undefined（_$oU 被覆盖）
 */
const fs = require('fs');
const vm = require('vm');

// 读取 body_fixed3
const body = fs.readFileSync('/tmp/nx_vm_body_fixed3.js', 'utf8');

// 在 opcode 276 前注入表检查（错误在 276 区域）
const op276 = body.indexOf('_$jc===276');
console.log('opcode 276 @', op276);
if (op276 >= 0) {
  const log = `console.log('[trace276] _\$oU:', typeof _\$oU, '_\$oU[176]:', _\$oU&&_\$oU[176], '_\$mD:', typeof _\$mD, '_\$mD.length:', _\$mD&&_\$mD.length, '_\$mD[176]:', _\$mD&&_\$mD[176]);`;
  const traced = body.substring(0, op276) + log + body.substring(op276);
  fs.writeFileSync('/tmp/nx_vm_body_trace176.js', traced);
  console.log('已注入 276 追踪');
}

// 构建 sandbox（复用 903）
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
const more = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_more.json', 'utf8'));
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

function parseArr(val) {
  return val.map(v => {
    if (typeof v === 'string') {
      if (v === 'null') return null;
      if (v.startsWith('fn:')) return function () {};
      if (v.startsWith('obj:')) return {};
      if (v.startsWith('n:')) return +v.substring(2);
      if (v.startsWith('s:')) return v.substring(2);
      if (v.startsWith('b:')) return v.substring(2) === 'true';
      return v;
    }
    return v;
  });
}

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

sandbox._$a2 = sandbox;
sandbox._$oU = tables['_$oU'].val;
sandbox._$b1 = tables['_$b1'].val;
sandbox._$lc = tables['_$lc'].val;
sandbox._$mD = new Array(67).fill(null);
sandbox._$mD[66] = [];
sandbox._$k0 = tables['_$k0'].val;
sandbox._$bk = tables['_$bk'].val;
sandbox._$ez = tables['_$ez'].val;
sandbox._$pL = tables['_$pL'].val;
['_$oP', '_$f$', '_$lC', '_$ll', '_$jR', '_$d5', '_$av', '_$ah', '_$mg', '_$ma', '_$c7'].forEach(k => {
  if (more[k] && more[k].type === 'array' && more[k].val) sandbox[k] = parseArr(more[k].val);
});

sandbox.$_ts = { scj: inputs.scj, aebi: inputs.aebi, cd: inputs.cd || '', nsd: inputs.nsd || 0, cp: {}, jf: {}, lcd: '' };

vm.createContext(sandbox);

console.log('[开始] 追踪 176 错误...');
try {
  vm.runInContext(fs.readFileSync('/tmp/nx_vm_body_trace176.js', 'utf8'), sandbox, { timeout: 30000 });
  console.log('[完成]');
} catch (e) {
  console.error('[失败]', e.message);
}