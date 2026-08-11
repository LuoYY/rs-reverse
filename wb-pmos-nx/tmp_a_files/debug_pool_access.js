// 调试：确认池注入 + 定位 undefined[0]
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8'));
const pools = data.pools;
let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

// 检查 dynCode 是否有 'use strict'
console.log('[DB] dynCode 含 use strict:', dynCode.includes('use strict'));

// IIFE 注入
const poolDefs = [
  ['_$k0', pools.k0], ['_$b1', pools.b1], ['_$oP', pools.oP], ['_$lC', pools.lC],
  ['_$lc', pools.lc], ['_$$M', pools.M], ['_$f$', pools.f], ['_$ll', pools.ll],
  ['_$_L', pools._L], ['_$$q', pools.q], ['_$_3', pools._3],
];
const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
if (iifeStart >= 0) {
  const inject = poolDefs.map(([n, v]) => `_${n}=${JSON.stringify(v)};`).join('');
  dynCode = dynCode.slice(0, iifeStart + '(function(_$$5,_$lP){'.length) + inject + dynCode.slice(iifeStart + '(function(_$$5,_$lP){'.length);
}
console.log('[DB] IIFE 注入后开头 300:', dynCode.slice(0, 300));

// sandbox 池加 Proxy 记录
function poolProxy(name, val) {
  return new Proxy(val, {
    get: (t, p) => {
      if (p === '__name') return name;
      const v = t[p];
      return v;
    },
  });
}
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
function safeProxy() {
  return new Proxy({}, {
    get: (t, p) => { if (p === 'toString') return () => '[object Object]'; if (typeof p === 'symbol') return undefined; return safeProxy(); },
    set: () => true,
  });
}
const fakeDoc = safeProxy(), fakeNav = safeProxy(), fakeLoc = safeProxy();
fakeNav.userAgent = UA; fakeNav.platform = 'MacIntel'; fakeDoc.cookie = ''; fakeDoc.readyState = 'complete';
fakeLoc.href = B + '/'; fakeLoc.protocol = 'https:'; fakeLoc.hostname = 'pmos.nx.sgcc.com.cn';
const sandbox = {
  console: { log: () => {}, error: () => {}, warn: () => {}, info: () => {} },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  String, Number, Boolean, Array, Object, Function, RegExp, Error, TypeError, Promise, Uint8Array, Uint16Array, Int32Array, Uint32Array, ArrayBuffer, DataView, Float32Array, Float64Array, Int8Array, Int16Array, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
  $_ts: { scj: data.scj, aebi: data.aebi },
  document: fakeDoc, navigator: fakeNav, location: fakeLoc,
  window: undefined, globalThis: undefined, self: undefined, top: undefined, parent: undefined,
  screen: safeProxy(), innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
};
// 池全局（Proxy 记录访问）
for (const [n, v] of poolDefs) {
  sandbox['_' + n] = v;
}
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;

// 测试池可见性
for (const n of ['_$k0', '_$b1', '_$lC', '_$ll', '_$$M']) {
  const v = sandbox[n];
  console.log('[DB] sandbox.' + n + ':', v ? ('len=' + v.length) : 'undefined');
}
try {
  const t = vm.runInContext('typeof _$lC', ctx);
  console.log('[DB] vm 中 _$lC:', t);
} catch (e) { console.log('[DB] vm 访问 _$lC 错误:', e.message); }
try {
  const t2 = vm.runInContext('_$lC[130]', ctx);
  console.log('[DB] vm 中 _$lC[130]:', t2);
} catch (e) { console.log('[DB] vm 访问 _$lC[130] 错误:', e.message); }

// 执行 dynCode
console.log('[DB] 执行 dynCode...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 20000 });
  console.log('[DB] 执行完成');
} catch (e) {
  console.log('[DB] 执行错误:', e.message);
  const m = (e.stack || '').match(/<anonymous>:2:(\d+)/);
  if (m) {
    const col = +m[1];
    console.log('[DB] 错误列号 col=' + col);
    console.log('[DB] 错误点代码:', dynCode.slice(col - 120, col + 120));
  }
}
