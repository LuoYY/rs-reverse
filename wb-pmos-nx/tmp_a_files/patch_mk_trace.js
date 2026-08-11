// patch _$mk 函数（try-catch 包裹）定位错误 + 检查 _$a2
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
// patch _$mk：在函数体开头注入日志
const mkStart = 'function _$mk(){var _$aq;_$aq=_$a2[_$oU[159]];';
if (dynCode.indexOf(mkStart) >= 0) {
  const inj = 'function _$mk(){try{window.__mkN=window.__mkN||0;window.__mkN++;if(window.__mkN===1){window.__mkA2=typeof _$a2;window.__mkA2p=(typeof _$a2!=="undefined")?(typeof _$a2["performance"]):"n/a";}}catch(__e){window.__mkE=String(__e);}var _$aq;_$aq=_$a2[_$oU[159]];';
  dynCode = dynCode.split(mkStart).join(inj);
  console.log('[MK] _$mk 注入 OK');
}
// IIFE 开头注入池
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
fs.writeFileSync(path.join(__dirname, 'nx_dynCode_mk_patched.js'), dynCode);
console.log('[MK] saved');

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

console.log('[MK] 执行 dynCode...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 30000 });
  console.log('[MK] 执行完成!');
} catch (e) {
  console.log('[MK] 错误:', e.message);
  console.log('[MK] 栈:', (e.stack || '').split('\n').slice(0, 6).join('\n[MK]   '));
}
const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
console.log('[MK] _$mk 调用数:', q('typeof __mkN!=="undefined"?__mkN:0'));
console.log('[MK] a2 type:', q('typeof __mkA2!=="undefined"?__mkA2:"none"'), 'a2[performance]:', q('typeof __mkA2p!=="undefined"?__mkA2p:"none"'));
console.log('[MK] mkE:', q('typeof __mkE!=="undefined"?__mkE:null'));
console.log('[MK] ktFinal:', q('typeof __ktF!=="undefined"?__ktF.length:0'));
