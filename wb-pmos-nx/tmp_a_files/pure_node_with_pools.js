// ★ 纯 Node 重现 dynCode（最小 sdenv）：注入同会话池（k0/字符串池），执行 base 生成
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_pools_same.json'), 'utf8'));
const pools = data.pools;
// tables_init 提供 _$oU（196 字符串池）
const tables = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const oU = tables._$oU.val || tables._$oU;
let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

console.log('[PN] 注入同会话池...');
// 删除 'use strict'（避免隐式全局报错）
dynCode = dynCode.replace(/['"]use strict['"];/g, '');
// 注入 _$oU（tables）
dynCode = dynCode.replace(/['"]use strict['"];/g, '');
const oUDef = `_$oU=${JSON.stringify(oU)};`;
// 找 _$oU 初始化点（主循环 opcode），替换为注入
// 常见形式：_$oU=... 或 _$oU=[...
const oUInit = dynCode.indexOf('_$oU=[');
if (oUInit >= 0) {
  let depth = 0, end = -1;
  for (let j = oUInit + 5; j < dynCode.length; j++) {
    if (dynCode[j] === '[') depth++;
    else if (dynCode[j] === ']') { depth--; if (depth === 0) { end = j; break; } }
  }
  dynCode = dynCode.slice(0, oUInit) + '_$oU=' + JSON.stringify(oU) + dynCode.slice(end + 1);
  console.log('[PN] ✓ _$oU 主循环替换 (' + oU.length + ')');
} else {
  // IIFE 开头注入
  const ii = dynCode.indexOf('(function(_$$5,_$lP){');
  if (ii >= 0) {
    dynCode = dynCode.slice(0, ii + '(function(_$$5,_$lP){'.length) + oUDef + dynCode.slice(ii + '(function(_$$5,_$lP){'.length);
    console.log('[PN] ✓ _$oU IIFE 注入 (' + oU.length + ')');
  }
}
// 在 IIFE 开头注入池（首次可用，早于 JSVMP 初始化）
const poolDefs = [
  ['_$k0', pools.k0],
  ['_$b1', pools.b1],
  ['_$oP', pools.oP],
  ['_$lC', pools.lC],
  ['_$lc', pools.lc],
  ['_$$M', pools.M],
  ['_$f$', pools.f],
  ['_$ll', pools.ll],
  ['_$_L', pools._L],
  ['_$$q', pools.q],
  ['_$_3', pools._3],
];
// 同时替换主循环的池赋值（避免 _$kB 未初始化导致覆盖）
const poolAssign = [
  ['_$k0=_$nP(_$ez);', '_$k0', pools.k0],
  ['_$b1=_$kB[1];', '_$b1', pools.b1],
  ['_$oP=_$kB[2];', '_$oP', pools.oP],
  ['_$lC=_$kB[3];', '_$lC', pools.lC],
  ['_$lc=_$kB[4];', '_$lc', pools.lc],
  ['_$$M=_$kB[5];', '_$$M', pools.M],
  ['_$f$=_$kB[6];', '_$f$', pools.f],
  ['_$ll=_$kB[7];', '_$ll', pools.ll],
  ['_$_L=_$kB[8];', '_$_L', pools._L],
  ['_$$q=_$kB[9];', '_$$q', pools.q],
  ['_$_3=_$kB[10];', '_$_3', pools._3],
];
let patchedCount = 0;
// 1) IIFE 开头注入
const iifeStart = dynCode.indexOf('(function(_$$5,_$lP){');
if (iifeStart >= 0) {
  const inject = poolDefs.map(([n, v]) => `${n}=${JSON.stringify(v)};`).join('');
  // 注入 _$fF（Date）等运行时兜底 + _$a2=window（环境对象）
  const runtimeInject = '_$fF=Date;_$aN=String.fromCharCode;_$ah=Math;_$jR=window;_$a2=window;';
  dynCode = dynCode.slice(0, iifeStart + '(function(_$$5,_$lP){'.length) + inject + runtimeInject + dynCode.slice(iifeStart + '(function(_$$5,_$lP){'.length);
  console.log('[PN] IIFE 开头注入 ' + poolDefs.length + ' 个池 + 运行时兜底');
}
// 2) 主循环替换
for (const [oldS, name, val] of poolAssign) {
  if (dynCode.indexOf(oldS) >= 0) {
    dynCode = dynCode.split(oldS).join(`${name}=${JSON.stringify(val)};`);
    patchedCount++;
  }
}
console.log('[PN] 主循环替换: ' + patchedCount + '/' + poolAssign.length);

// 构建最小环境
const noop = () => {};
function safeProxy() {
  return new Proxy({}, {
    get: (t, p) => {
      if (p === 'toString') return () => '[object Object]';
      if (typeof p === 'symbol') return undefined;
      return safeProxy();
    },
    set: () => true,
  });
}
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const fakeDoc = safeProxy();
const fakeNav = safeProxy();
const fakeLoc = safeProxy();
fakeNav.userAgent = UA; fakeNav.appVersion = UA; fakeNav.platform = 'MacIntel';
fakeDoc.cookie = ''; fakeDoc.readyState = 'complete';
fakeLoc.href = B + '/'; fakeLoc.protocol = 'https:'; fakeLoc.hostname = 'pmos.nx.sgcc.com.cn'; fakeLoc.port = '10443'; fakeLoc.pathname = '/';
const sandbox = {
  console: { log: noop, error: noop, warn: noop, info: noop },
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  String, Number, Boolean, Array, Object, Function, RegExp, Error, TypeError, Promise, Uint8Array, Uint16Array, Int32Array, Uint32Array, ArrayBuffer, DataView, Float32Array, Float64Array, Int8Array, Int16Array, Map, Set, WeakMap, WeakSet, Symbol, Proxy, Reflect,
  $_ts: { scj: data.scj, aebi: data.aebi },
  document: fakeDoc, navigator: fakeNav, location: fakeLoc,
  window: undefined, globalThis: undefined, self: undefined, top: undefined, parent: undefined,
  screen: safeProxy(), innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  performance: (typeof performance !== 'undefined') ? performance : require('perf_hooks').performance,
  // 全局池（dynCode 顶层函数访问）
  _$k0: pools.k0, _$b1: pools.b1, _$oP: pools.oP, _$lC: pools.lC, _$lc: pools.lc,
  _$$M: pools.M, _$f$: pools.f, _$ll: pools.ll, _$_L: pools._L, _$$q: pools.q, _$_3: pools._3,
  // 兜底：_$fF（Date）、_$gB
  _$fF: Date, _$aN: String.fromCharCode,
};
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.top = sandbox;
sandbox.parent = sandbox;

console.log('[PN] 开始执行 dynCode (纯 Node + 注入池)...');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, ctx, { timeout: 20000 });
  console.log('[PN] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
} catch (e) {
  console.log('[PN] 执行错误:', e.message);
  const stack = e.stack || '';
  const lines = stack.split('\n');
  lines.forEach(l => console.log('[PN]   ' + l.slice(0, 200)));
  // 提取错误列号
  const m = stack.match(/<anonymous>:2:(\d+)/);
  if (m) {
    const col = +m[1];
    console.log('[PN] 错误列号 col=' + col);
    if (col < dynCode.length) {
      console.log('[PN] 错误点代码:', dynCode.slice(col - 120, col + 120));
    }
  }
  // 调试：检查运行时状态
  const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[PN] _$fF:', q('typeof _$fF'), '_$gB:', q('typeof _$gB'), '_$mS:', q('typeof _$mS'));
  console.log('[PN] _$c4:', q('typeof _$c4'));
  console.log('[PN] test _$c4(2137):', q('(function(){try{return String(_$c4(2137));}catch(e){return "ERR:"+e.message;}})()'));
  console.log('[PN] test _$mS:', q('(function(){try{return String(_$mS(0));}catch(e){return "ERR:"+e.message;}})()'));
}
const ktF = sandbox.__ktF;
console.log('[PN] ktFinal:', ktF ? ('len=' + ktF.length + ' head=' + ktF.slice(0, 8).join(',')) : 'null');
const realKt = data.ktFinal;
console.log('[PN] 真实 ktFinal head:', realKt.slice(0, 8).join(','));
if (ktF && realKt) {
  const same = ktF.length === realKt.length && ktF.every((v, i) => v === realKt[i]);
  console.log('[PN] ★ 与真实 ktFinal 一致:', same);
  if (!same) {
    const diffs = [];
    for (let i = 0; i < Math.min(ktF.length, realKt.length); i++) if (ktF[i] !== realKt[i]) diffs.push(i);
    console.log('[PN] 差异位置:', diffs.slice(0, 20).join(','));
  }
}
console.log('[PN] ezD:', sandbox.__ezD ? ('len=' + sandbox.__ezD.length) : 'null');
