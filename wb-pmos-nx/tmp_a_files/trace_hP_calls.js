// trace 编码器实际调用的 hP 索引（_$oi 值），确定 Go 需要实现哪些环境函数
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_complete.js'), 'utf8');
const dyn = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');
function extractFn(c, name, startPos) {
  let i = startPos !== undefined ? startPos : c.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let depth = 0, end = -1;
  for (let j = c.indexOf('{', i); j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
const izSrc = extractFn(dyn, '_$iz', 112244);
const enSrc = extractFn(dyn, '_$en', 112057);
const fNSrc = extractFn(dyn, '_$fN');
const dtSrc = extractFn(dyn, '_$dt');

// patch _$cS：在 _$pc[_$oi] 调用前记录 _$oi（当 _$pc 是 hP）
const cSPat = 'function _$cS(_$aq,_$_T,_$hr,_$kx){var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
const cSInj = 'function _$cS(_$aq,_$_T,_$hr,_$kx){var __oipc=function(){if(_$pc===_$hP&&typeof _$oi!=="undefined"){globalThis.__hpC=globalThis.__hpC||[];globalThis.__hpC.push(_$oi);if(globalThis.__hpC.length>5000)globalThis.__hpC.splice(0,2500);}};var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
console.log('[TH] cS 匹配:', iE.includes(cSPat));
iE = iE.replace(cSPat, cSInj);
// 在每个 _$pc[_$oi]( 调用前插入 __oipc()
// 简单：替换 _$pc[_$oi]( 为 __oipc(),_$pc[_$oi](
iE = iE.split('_$pc[_$oi](').join('__oipc(),_$pc[_$oi](');
console.log('[TH] 插桩完成');

const gsStart = dyn.indexOf('_$iE("r2mKa');
const seg = dyn.slice(gsStart + 6);
let j = 0, inEscape = false;
for (; j < seg.length; j++) {
  if (inEscape) { inEscape = false; continue; }
  if (seg[j] === '\\') { inEscape = true; continue; }
  if (seg[j] === '"') break;
}
const gs = vm.runInContext('"' + seg.slice(0, j) + '"', vm.createContext({}));
const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_iE_v2.json'), 'utf8'))[0];
const k6 = args.k6.vals, hZ = args.hZ.vals, oA = args.oA.vals;
const jM = Array(9).fill((function(){}));
const hP = args.hP.vals.map(x => (function(){}));

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: String, _$aN: String.fromCharCode,
  _$ie: String.prototype.charCodeAt, _$mT: String.prototype.substr,
  window: {},
};
const ctx = vm.createContext(sandbox);
vm.runInContext(izSrc, ctx); vm.runInContext(enSrc, ctx); vm.runInContext(fNSrc, ctx); vm.runInContext(dtSrc, ctx);
vm.runInContext(iE, ctx);
sandbox.__gs = gs; sandbox.__k6 = k6; sandbox.__hZ = hZ; sandbox.__oA = oA; sandbox.__jM = jM; sandbox.__hP = hP;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, __k6, __hZ, [], __oA, __jM, __hP);
      return {ok:true};
    } catch(e) { return {err:String(e && e.message||e)}; }
  })()`, ctx);
  console.log('[TH] 结果:', JSON.stringify(r).slice(0, 100));
} catch (e) { console.log('[TH] 调用异常:', e.message); }
const calls = vm.runInContext('typeof globalThis.__hpC!=="undefined"?globalThis.__hpC:null', ctx);
console.log('[TH] hP 调用索引:', calls ? calls.join(',') : 'null');
console.log('[TH] 唯一索引:', calls ? [...new Set(calls)].join(',') : 'null');
process.exit(0);
