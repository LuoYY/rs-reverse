// patch _$dI 加 try-catch，精确定位纯 Node 执行错误
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8'));
const pools = data.pools;
const tables = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const oU = tables._$oU.val || tables._$oU;
let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

// 删除 use strict
dynCode = dynCode.replace(/['"]use strict['"];/g, '');
// 注入 _$oU
dynCode = dynCode.split('_$oU=[').join('_$oU=' + JSON.stringify(oU) + ';window.__x=1;/*[');
// 更可靠：IIFE 开头注入
const poolDefs = [
  ['_$k0', pools.k0], ['_$b1', pools.b1], ['_$oP', pools.oP], ['_$lC', pools.lC],
  ['_$lc', pools.lc], ['_$$M', pools.M], ['_$f$', pools.f], ['_$ll', pools.ll],
  ['_$_L', pools._L], ['_$$q', pools.q], ['_$_3', pools._3],
];
const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
if (iifeStart >= 0) {
  const inject = poolDefs.map(([n, v]) => `${n}=${JSON.stringify(v)};`).join('');
  dynCode = dynCode.slice(0, iifeStart + '(function(_$$5,_$lP){'.length) + inject + '_$fF=Date;_$aN=String.fromCharCode;_$ah=Math;' + dynCode.slice(iifeStart + '(function(_$$5,_$lP){'.length);
}
// patch _$dI：开头记录 _$_T 类型 + 尝试捕获内部错误
const dIStart = 'function _$dI(_$aq,_$_T){var _$hr;';
if (dynCode.indexOf(dIStart) >= 0) {
  const inj = `function _$dI(_$aq,_$_T){try{window.__di=window.__di||[];window.__di.push({t:typeof _$_T==="string"?_$_T:(Array.isArray(_$_T)?"arr"+_$_T.length:(_$_T&&_$_T._\$b4!=null?"obj"+_$_T._\$b4:typeof _$_T))});if(window.__di.length>5000)window.__di.splice(0,2500);}catch(__e){window.__diE=String(__e);}try{var _$hr;`;
  dynCode = dynCode.split(dIStart).join(inj);
  // 在 _$dI 结束前关闭 try-catch（找 _$dI 函数边界）
  const dIIndex = dynCode.indexOf('function _$dI(');
  if (dIIndex >= 0) {
    let depth = 0, end = -1;
    for (let j = dIIndex; j < dynCode.length; j++) {
      if (dynCode[j] === '{') depth++;
      else if (dynCode[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end >= 0) {
      // 在函数末尾的 } 前插入 catch
      dynCode = dynCode.slice(0, end) + '}catch(__e){window.__diErr=window.__diErr||[];window.__diErr.push(String(__e));if(window.__diErr.length>100)window.__diErr.splice(0,50);throw __e;}' + dynCode.slice(end);
      console.log('[DT] _$dI try-catch 注入 OK');
    }
  }
}
fs.writeFileSync(path.join(__dirname, 'nx_dynCode_di_patched.js'), dynCode);
console.log('[DT] saved nx_dynCode_di_patched.js');

// 执行
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
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;

console.log('[DT] 执行 dynCode...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 20000 });
  console.log('[DT] 执行完成');
} catch (e) {
  console.log('[DT] 错误:', e.message);
  const m = (e.stack || '').match(/<anonymous>:2:(\d+)/);
  if (m) {
    const col = +m[1];
    console.log('[DT] 列号 col=' + col);
    if (col < dynCode.length) console.log('[DT] 代码:', dynCode.slice(col - 100, col + 100));
  }
}
const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
const n = q('typeof __di!=="undefined"?__di.length:0');
console.log('[DT] _$dI 记录数:', n);
if (n > 0) console.log('[DT] 最后记录:', q('JSON.stringify(__di.slice(-3))'));
console.log('[DT] diErr:', q('typeof __diErr!=="undefined"?JSON.stringify(__diErr.slice(-3)):null'));
const ktF = q('typeof __ktF!=="undefined"?__ktF.length:0');
console.log('[DT] ktFinal:', ktF);
