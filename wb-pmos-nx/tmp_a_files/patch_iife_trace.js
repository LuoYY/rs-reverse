// IIFE 级 try-catch：捕获 dynCode 执行的所有错误 + 完整调用栈
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8'));
const pools = data.pools;
const tables = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const oU = tables._$oU.val || tables._$oU;
let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

dynCode = dynCode.replace(/['"]use strict['"];/g, '');
// IIFE 开头注入池 + try
const poolDefs = [
  ['_$k0', pools.k0], ['_$b1', pools.b1], ['_$oP', pools.oP], ['_$lC', pools.lC],
  ['_$lc', pools.lc], ['_$$M', pools.M], ['_$f$', pools.f], ['_$ll', pools.ll],
  ['_$_L', pools._L], ['_$$q', pools.q], ['_$_3', pools._3],
];
const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
if (iifeStart >= 0) {
  const inject = poolDefs.map(([n, v]) => `${n}=${JSON.stringify(v)};`).join('');
  const runtime = `_$oU=${JSON.stringify(oU)};_$fF=Date;_$aN=String.fromCharCode;_$ah=Math;_$jR=window;_$a2=window;try{window.__iifeN=window.__iifeN||0;window.__iifeN++;`;
  dynCode = dynCode.slice(0, iifeStart + '(function(_$$5,_$lP){'.length) + inject + runtime + dynCode.slice(iifeStart + '(function(_$$5,_$lP){'.length);
}
// IIFE 末尾加 catch（找 })($_ts.scj,$_ts.aebi);）
const tail = '})($_ts.scj,$_ts.aebi);';
if (dynCode.indexOf(tail) >= 0) {
  dynCode = dynCode.split(tail).join('}catch(__e){window.__iifeE=window.__iifeE||[];window.__iifeE.push({msg:String(__e),stack:(__e&&__e.stack||"").split("\\n").slice(0,15).join("|")});if(window.__iifeE.length>10)window.__iifeE.splice(0,5);throw __e;}' + tail);
  console.log('[IT] IIFE 末尾 catch 注入 OK');
}
fs.writeFileSync(path.join(__dirname, 'nx_dynCode_iife_patched.js'), dynCode);
console.log('[IT] saved');

function safeProxy() {
  return new Proxy({}, {
    get: (t, p) => { if (p === 'toString') return () => '[object Object]'; if (typeof p === 'symbol') return undefined; return safeProxy(); },
    set: () => true,
  });
}
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const perf = (typeof performance !== 'undefined') ? performance : require('perf_hooks').performance;
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
  performance: perf, Error,
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
try { sandbox.Error.stackTraceLimit = 100; } catch (e) {}

console.log('[IT] 执行 dynCode...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 30000 });
  console.log('[IT] 执行完成!');
} catch (e) {
  console.log('[IT] 错误:', e.message);
  console.log('[IT] 栈:', (e.stack || '').split('\n').slice(0, 12).join('\n[IT]   '));
}
const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
console.log('[IT] IIFE 调用数:', q('typeof __iifeN!=="undefined"?__iifeN:0'));
console.log('[IT] 内部错误:', q('typeof __iifeE!=="undefined"?JSON.stringify(__iifeE.slice(-2)):null'));
console.log('[IT] ktFinal:', q('typeof __ktF!=="undefined"?__ktF.length:0'));
