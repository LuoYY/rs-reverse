// ★ 纯 Node vm 执行 dynCode（符号执行器）——输入 scj/aebi/ez，输出 ktFinal(base)
// 不依赖 sdenv/jsdom，只用 Node vm + 同会话捕获的输入
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const inputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_vm_full_inputs.json'), 'utf8'));
const dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

console.log('[PV] scj:', JSON.stringify(inputs.scj).slice(0, 150));
console.log('[PV] aebi len:', inputs.aebi.length, 'aebi[1] len:', (inputs.aebi[1] || []).length);
console.log('[PV] ez len:', inputs.ez.length);

// 构建纯 Node vm 环境（全 Proxy 安全环境：任何属性访问返回安全值）
const noop = () => {};
const safeVal = (p) => {
  if (p === 'style' || p === 'dataset') return {};
  if (p === 'classList') return { add: noop, remove: noop, contains: () => false, toggle: noop };
  if (p === 'length') return 0;
  if (p === 'cookie' || p === 'readyState' || p === 'visibilityState' || p === 'hidden') return '';
  if (p === 'width' || p === 'height' || p === 'availWidth' || p === 'availHeight' || p === 'colorDepth' || p === 'pixelDepth' || p === 'hardwareConcurrency' || p === 'maxTouchPoints' || p === 'innerWidth' || p === 'innerHeight' || p === 'outerWidth' || p === 'outerHeight' || p === 'devicePixelRatio' || p === 'top' || p === 'left') return 0;
  if (p === 'userAgent' || p === 'appVersion' || p === 'platform' || p === 'vendor' || p === 'appName' || p === 'appCodeName' || p === 'product' || p === 'productSub' || p === 'vendorSub') return '';
  if (p === 'language') return 'zh-CN';
  if (p === 'languages') return ['zh-CN'];
  if (p === 'onLine' || p === 'cookieEnabled') return true;
  if (p === 'webdriver' || p === 'doNotTrack') return false;
  if (p === 'plugins' || p === 'mimeTypes') return { length: 0 };
  if (p === 'toString') return () => '[object Object]';
  if (p === 'valueOf') return () => 0;
  if (typeof p === 'symbol') return undefined;
  return undefined;
};
function safeProxy() {
  return new Proxy({}, {
    get: (t, p) => {
      if (p === 'toString') return () => '[object Object]';
      if (typeof p === 'symbol') return undefined;
      const v = safeVal(p);
      if (v !== undefined) return v;
      return safeProxy();
    },
    set: () => true,
  });
}
const fakeDoc = safeProxy();
const fakeNav = safeProxy();
const fakeLoc = safeProxy();
const fakeScreen = safeProxy();
fakeNav.userAgent = UA; fakeNav.appVersion = UA; fakeNav.platform = 'MacIntel';
fakeDoc.cookie = ''; fakeDoc.readyState = 'complete';
fakeLoc.href = B + '/'; fakeLoc.protocol = 'https:'; fakeLoc.hostname = 'pmos.nx.sgcc.com.cn'; fakeLoc.port = '10443'; fakeLoc.pathname = '/';
fakeScreen.width = 1440; fakeScreen.height = 900;
const sandbox = {
  console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
  setTimeout: (fn) => 0, clearTimeout: () => {},
  setInterval: () => 0, clearInterval: () => {},
  Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  String, Number, Boolean, Array, Object, Function, RegExp, Error, TypeError, Promise, Uint8Array, Uint16Array, Int32Array, Uint32Array, ArrayBuffer, DataView, Float32Array, Float64Array, Int8Array, Int16Array, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
  // $_ts：dynCode 入口参数
  $_ts: { scj: inputs.scj, aebi: inputs.aebi },
  document: fakeDoc,
  navigator: fakeNav,
  location: fakeLoc,
  window: undefined, globalThis: undefined, self: undefined, top: undefined, parent: undefined,
  screen: fakeScreen,
  innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 900,
  devicePixelRatio: 1,
  __out: null,
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;

console.log('[PV] 开始执行 dynCode (纯 Node vm)...');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, ctx, { timeout: 20000 });
  console.log('[PV] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
} catch (e) {
  console.log('[PV] 执行错误:', e.message);
  // 定位错误行：找主循环附近的代码
  const stack = e.stack || '';
  const lines = stack.split('\n');
  console.log('[PV] 栈行数:', lines.length);
  lines.slice(0, 8).forEach(l => console.log('[PV]   ' + l.slice(0, 150)));
}
const ktF = sandbox.__ktF;
console.log('[PV] ktFinal:', ktF ? ('len=' + ktF.length + ' head=' + ktF.slice(0, 8).join(',')) : 'null');
console.log('[PV] ezD:', sandbox.__ezD ? ('len=' + sandbox.__ezD.length) : 'null');
// 对比真实 ktFinal
const realKt = inputs.ktFinal;
console.log('[PV] 真实 ktFinal head:', realKt.slice(0, 8).join(','));
if (ktF) {
  const same = ktF.length === realKt.length && ktF.every((v, i) => v === realKt[i]);
  console.log('[PV] ★ 与真实 ktFinal 一致:', same);
  if (!same) {
    const diffs = [];
    for (let i = 0; i < Math.min(ktF.length, realKt.length); i++) if (ktF[i] !== realKt[i]) diffs.push(i);
    console.log('[PV] 差异位置:', diffs.slice(0, 20).join(','));
  }
}
