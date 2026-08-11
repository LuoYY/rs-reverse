// 捕获 dynCode 实际访问的 window/document/navigator 属性（环境清单）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8'));
const pools = data.pools;
const tsFull = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
const tables = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const oU = tables._$oU.val || tables._$oU;
let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

dynCode = dynCode.replace(/['"]use strict['"];/g, '');
const poolDefs = [
  ['_$k0', pools.k0], ['_$b1', pools.b1], ['_$oP', pools.oP], ['_$lC', pools.lC],
  ['_$lc', pools.lc], ['_$$M', pools.M], ['_$f$', pools.f], ['_$ll', pools.ll],
  ['_$_L', pools._L], ['_$$q', pools.q], ['_$_3', pools._3],
];
const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
if (iifeStart >= 0) {
  const inject = poolDefs.map(([n, v]) => `${n}=${JSON.stringify(v)};`).join('');
  const runtime = `_$oU=${JSON.stringify(oU)};_$fF=Date;_$aN=String.fromCharCode;_$ah=Math;_$jR=window;_$a2=window;`;
  dynCode = dynCode.slice(0, iifeStart + '(function(_$$5,_$lP){'.length) + inject + runtime + dynCode.slice(iifeStart + '(function(_$$5,_$lP){'.length);
}
console.log('[EA] dynCode 注入完成');

// 记录环境访问的 Proxy
const accessLog = { window: {}, doc: {}, nav: {}, scr: {} };
function makeTracked(name) {
  return new Proxy(function () {}, {
    get: (t, p) => {
      if (p === 'toString') return () => '[object Object]';
      if (typeof p === 'symbol') return undefined;
      accessLog[name][String(p)] = (accessLog[name][String(p)] || 0) + 1;
      if (p === 'length') return 0;
      return makeTracked(name);
    },
    apply: () => { accessLog[name]['__call__'] = (accessLog[name]['__call__'] || 0) + 1; return makeTracked(name); },
    construct: () => makeTracked(name),
    set: () => true,
  });
}
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const perf = (typeof performance !== 'undefined') ? performance : require('perf_hooks').performance;
const fakeDoc = makeTracked('doc');
const fakeNav = makeTracked('nav');
const fakeLoc = makeTracked('nav');
const fakeScreen = makeTracked('scr');
fakeNav.userAgent = UA; fakeNav.platform = 'MacIntel'; fakeDoc.cookie = ''; fakeDoc.readyState = 'complete';
const sandbox = {
  console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  String, Number, Boolean, Array, Object, Function, RegExp, Error, TypeError, Promise, Uint8Array, Uint16Array, Int32Array, Uint32Array, ArrayBuffer, DataView, Float32Array, Float64Array, Int8Array, Int16Array, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
  $_ts: { nsd: tsFull.nsd, cd: tsFull.cd, lcd: tsFull.lcd, cp: tsFull.cp, jf: tsFull.jf, aebi: tsFull.aebi, scj: tsFull.scj },
  document: fakeDoc, navigator: fakeNav, location: fakeLoc,
  window: undefined, globalThis: undefined, self: undefined, top: undefined, parent: undefined,
  screen: fakeScreen, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  performance: perf, Error,
};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.attachEvent = () => {};
sandbox.dispatchEvent = () => true;
const ctx = vm.createContext(sandbox);
sandbox.window = new Proxy(sandbox, {
  get: (t, p) => {
    if (typeof p === 'symbol') return undefined;
    accessLog['window'][String(p)] = (accessLog['window'][String(p)] || 0) + 1;
    if (p === 'addEventListener' || p === 'removeEventListener' || p === 'attachEvent') return () => {};
    if (p === 'performance') return perf;
    const v = t[p];
    return v;
  },
  set: () => true,
});
sandbox.globalThis = sandbox.window; sandbox.self = sandbox.window; sandbox.top = sandbox.window; sandbox.parent = sandbox.window;

console.log('[EA] 执行 dynCode (timeout 8s)...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 8000 });
  console.log('[EA] 执行完成!');
} catch (e) {
  console.log('[EA] 错误/超时:', e.message);
}
// 输出访问清单
console.log('\n=== window 属性访问 (前 40) ===');
Object.entries(accessLog.window).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log('  ' + k + ' ×' + v));
console.log('\n=== document 属性访问 (前 30) ===');
Object.entries(accessLog.doc).sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log('  ' + k + ' ×' + v));
console.log('\n=== navigator 属性访问 (前 20) ===');
Object.entries(accessLog.nav).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log('  ' + k + ' ×' + v));
