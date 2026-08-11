// trace 每个 opcode 执行（记录 gS 位置 + opcode + oi/pc 状态）
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

// patch _$cS：循环开头记录 opcode
const cSPat = 'function _$cS(_$aq,_$_T,_$hr,_$kx){var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
const cSInj = 'function _$cS(_$aq,_$_T,_$hr,_$kx){globalThis.__ops=globalThis.__ops||[];var __tr=function(){globalThis.__ops.push((_$md)+":"+_$gx[_$md]);if(globalThis.__ops.length>3000)globalThis.__ops.splice(0,1500);};var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS';
iE = iE.replace(cSPat, cSInj);
// 循环 for(_$md=_$_T;_$md<_$hr;_$md++ ) 后插 __tr()
iE = iE.replace('for(_$md=_$_T;_$md<_$hr;_$md++ ){_$hi=_$gx[_$md];',
  'for(_$md=_$_T;_$md<_$hr;_$md++ ){__tr();_$hi=_$gx[_$md];');

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
  console.log('[TO] 结果:', JSON.stringify(r).slice(0, 100));
} catch (e) { console.log('[TO] 调用异常:', e.message); }
const ops = vm.runInContext('typeof globalThis.__ops!=="undefined"?globalThis.__ops:null', ctx);
console.log('[TO] opcode 序列:', ops ? ops.join(' ') : 'null');
process.exit(0);
