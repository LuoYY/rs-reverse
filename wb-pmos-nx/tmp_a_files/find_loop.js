// 插桩主循环记录 pc 进度，定位死循环
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
// 插桩所有 while(1)（记录计数，找死循环）
let wCount = 0;
while (dynCode.indexOf('while(1){') >= 0) {
  dynCode = dynCode.replace('while(1){', `while(1){window.__w${wCount}=(window.__w${wCount}||0)+1;`);
  wCount++;
}
console.log('[LP] 插桩 while(1) 数量:', wCount);
fs.writeFileSync(path.join(__dirname, 'nx_dynCode_loop_patched.js'), dynCode);

function safeProxy() {
  const fn = new Proxy(function () {}, {
    get: (t, p) => { if (p === 'toString') return () => '[object Object]'; if (p === 'valueOf') return () => 0; if (typeof p === 'symbol') return undefined; return safeProxy(); },
    apply: () => safeProxy(), construct: () => safeProxy(), set: () => true,
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
  $_ts: { nsd: tsFull.nsd, cd: tsFull.cd, lcd: tsFull.lcd, cp: tsFull.cp, jf: tsFull.jf, aebi: tsFull.aebi, scj: tsFull.scj },
  document: fakeDoc, navigator: fakeNav, location: fakeLoc,
  window: undefined, globalThis: undefined, self: undefined, top: undefined, parent: undefined,
  screen: safeProxy(), innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  performance: perf, Error,
};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.attachEvent = () => {};
sandbox.dispatchEvent = () => true;
const ctx = vm.createContext(sandbox);
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.top = sandbox; sandbox.parent = sandbox;

console.log('[LP] 执行 dynCode (timeout 3s)...');
try {
  vm.runInContext(dynCode, ctx, { timeout: 3000 });
  console.log('[LP] 执行完成!');
} catch (e) {
  console.log('[LP] 错误/超时:', e.message);
}
const q = (e) => { try { return vm.runInContext(e, ctx); } catch (e2) { return 'ERR:' + e2.message; } };
// 打印所有 while 计数
const wq = [];
for (let i = 0; i < wCount; i++) {
  const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
  if (n > 0) wq.push('w' + i + '=' + n);
}
console.log('[LP] while 计数:', wq.join(' | '));
console.log('[LP] ktF:', q('typeof __ktF!=="undefined"?__ktF.length:null'));
