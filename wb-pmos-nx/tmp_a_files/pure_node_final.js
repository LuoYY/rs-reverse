// ★ 纯 Node 重现 dynCode：完整 $_ts（含 cp）+ 同会话池 + 环境 stub
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
// IIFE 注入池 + 运行时
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
console.log('[PF] dynCode 注入完成, len=' + dynCode.length);

// 可调用安全 Proxy：任何属性访问/方法调用都不崩溃
function safeProxy() {
  const fn = new Proxy(function () {}, {
    get: (t, p) => {
      if (p === 'toString') return () => '[object Object]';
      if (p === 'valueOf') return () => 0;
      if (typeof p === 'symbol') return undefined;
      return safeProxy();
    },
    apply: () => safeProxy(),
    construct: () => safeProxy(),
    set: () => true,
  });
  return fn;
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
  // 完整 $_ts（含 cp）
  $_ts: { nsd: tsFull.nsd, cd: tsFull.cd, lcd: tsFull.lcd, cp: tsFull.cp, jf: tsFull.jf, aebi: tsFull.aebi, scj: tsFull.scj },
  document: fakeDoc, navigator: fakeNav, location: fakeLoc,
  window: undefined, globalThis: undefined, self: undefined, top: undefined, parent: undefined,
  screen: safeProxy(), innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  performance: perf, Error,
};
// window 事件方法（_$gj 注册用）
const noopFn = () => {};
sandbox.addEventListener = noopFn;
sandbox.removeEventListener = noopFn;
sandbox.attachEvent = noopFn;
sandbox.detachEvent = noopFn;
sandbox.dispatchEvent = () => true;
sandbox.postMessage = noopFn;
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;
try { sandbox.Error.stackTraceLimit = 100; } catch (e) {}

console.log('[PF] 开始执行 dynCode (纯 Node + 完整 $_ts)...');
const t0 = Date.now();
try {
  vm.runInContext(dynCode, ctx, { timeout: 60000 });
  console.log('[PF] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
} catch (e) {
  console.log('[PF] 执行错误:', e.message);
  console.log('[PF] 栈:', (e.stack || '').split('\n').slice(0, 8).join('\n[PF]   '));
}
// 捕获部分状态
const q2 = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
console.log('[PF] 部分状态 ezD:', q2('typeof __ezD!=="undefined"?__ezD.length:null'));
console.log('[PF] 部分状态 ktF:', q2('typeof __ktF!=="undefined"?__ktF.length:null'));
console.log('[PF] P cookie 生成:', q2('typeof document!=="undefined" && document.cookie ? document.cookie.length : "no"'));
const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
const ktF = q('typeof __ktF!=="undefined"?JSON.stringify(__ktF):null');
const realKt = data.ktFinal;
console.log('[PF] ktFinal:', ktF ? ('len=' + (JSON.parse(ktF).length)) : 'null');
if (ktF && realKt) {
  const kt = JSON.parse(ktF);
  console.log('[PF] 真实 ktFinal head:', realKt.slice(0, 8).join(','));
  const same = kt.length === realKt.length && kt.every((v, i) => v === realKt[i]);
  console.log('[PF] ★ 与真实 ktFinal 一致:', same);
  if (!same) {
    const diffs = [];
    for (let i = 0; i < Math.min(kt.length, realKt.length); i++) if (kt[i] !== realKt[i]) diffs.push(i);
    console.log('[PF] 差异位置:', diffs.slice(0, 20).join(','));
  }
}
console.log('[PF] ezD:', q('typeof __ezD!=="undefined"?__ezD.length:null'));
