// 提取 _$er 函数包 try-catch 再替换，捕获 tokenizer 执行错误
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
// 提取 _$er 函数
const erStart = dynCode.indexOf('function _$er(_$aq){');
console.log('[ET] _$er @' + erStart);
if (erStart < 0) { console.log('[ET] ✗ _$er 未找到'); process.exit(1); }
let depth = 0, erEnd = -1;
for (let j = erStart; j < dynCode.length; j++) {
  if (dynCode[j] === '{') depth++;
  else if (dynCode[j] === '}') { depth--; if (depth === 0) { erEnd = j; break; } }
}
const erFn = dynCode.slice(erStart, erEnd + 1);
console.log('[ET] _$er 长度:', erFn.length);
// 包 try-catch（在函数体开头加 try，末尾加 catch）
const bodyStart = dynCode.indexOf('{', erStart) + 1;
const bodyEnd = erEnd;
const newEr = dynCode.slice(erStart, bodyStart) + 'try{window.__erN=window.__erN||0;window.__erN++;' +
  dynCode.slice(bodyStart, bodyEnd) + '}catch(__e){window.__erE=window.__erE||[];window.__erE.push({n:window.__erN,msg:String(__e),stack:(__e&&__e.stack||"").split("\\n").slice(0,3).join("|")});if(window.__erE.length>50)window.__erE.splice(0,25);throw __e;}' +
  dynCode.slice(bodyEnd, bodyEnd + 1);
dynCode = dynCode.slice(0, erStart) + newEr + dynCode.slice(erEnd + 1);
console.log('[ET] _$er try-catch 注入 OK');

// 注入池（IIFE 开头）
const poolDefs = [
  ['_$k0', pools.k0], ['_$b1', pools.b1], ['_$oP', pools.oP], ['_$lC', pools.lC],
  ['_$lc', pools.lc], ['_$$M', pools.M], ['_$f$', pools.f], ['_$ll', pools.ll],
  ['_$_L', pools._L], ['_$$q', pools.q], ['_$_3', pools._3],
];
const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
if (iifeStart >= 0) {
  const inject = poolDefs.map(([n, v]) => `${n}=${JSON.stringify(v)};`).join('');
  dynCode = dynCode.slice(0, iifeStart + '(function(_$$5,_$lP){'.length) + inject + '_$oU=' + JSON.stringify(oU) + ';_$fF=Date;_$aN=String.fromCharCode;_$ah=Math;' + dynCode.slice(iifeStart + '(function(_$$5,_$lP){'.length);
}
fs.writeFileSync(path.join(__dirname, 'nx_dynCode_er_patched.js'), dynCode);
console.log('[ET] saved nx_dynCode_er_patched.js');

function safeProxy() {
  return new Proxy({}, {
    get: (t, p) => { if (p === 'toString') return () => '[object Object]'; if (typeof p === 'symbol') return undefined; return safeProxy(); },
    set: () => true,
  });
}
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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
  Error,
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
// 增大栈限制
try { sandbox.Error.stackTraceLimit = 100; } catch (e) {}

console.log('[ET] 执行 dynCode...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 20000 });
  console.log('[ET] 执行完成');
} catch (e) {
  console.log('[ET] 错误:', e.message);
  console.log('[ET] 完整栈:', (e.stack || '').split('\n').slice(0, 10).join('\n[ET]   '));
}
const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
console.log('[ET] _$er 调用数:', q('typeof __erN!=="undefined"?__erN:0'));
console.log('[ET] 错误记录:', q('typeof __erE!=="undefined"?JSON.stringify(__erE.slice(-3)):null'));
console.log('[ET] ktFinal:', q('typeof __ktF!=="undefined"?__ktF.length:0'));
