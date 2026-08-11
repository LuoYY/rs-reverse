// 调试 _$oi 值：patch _$cS 调用点打印
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

// patch _$cS：在 _$pc=_$pc[_$oi] 调用前打印（opcode 1/2/5 调用）
// 模式：_$pc=_$pc[_$oi],_$ax[_$jb++]=_$pc(_$ax[_$ms],_$ax[_$ms+1])
const pat1 = '_$pc=_$pc[_$oi],_$ax[_$jb++]=_$pc(_$ax[_$ms],_$ax[_$ms+1])';
const inj1 = 'console.log("CALL1 oi="+_$oi+" pctype="+Array.isArray(_$pc)+" pclen="+_$pc.length+" val="+typeof _$pc[_$oi]),_$pc=_$pc[_$oi],_$ax[_$jb++]=_$pc(_$ax[_$ms],_$ax[_$ms+1])';
// 模式2（调用 1 参数）：_$pc=_$pc[_$oi],_$ms=_$pc(_$ax[_$ms])
const pat2 = '_$pc=_$pc[_$oi],_$ms=_$pc(_$ax[_$ms])';
const inj2 = 'console.log("CALL2 oi="+_$oi+" pclen="+_$pc.length+" val="+typeof _$pc[_$oi]),_$pc=_$pc[_$oi],_$ms=_$pc(_$ax[_$ms])';
let count = 0;
if (iE.includes(pat1)) { iE = iE.replace(pat1, inj1); count++; }
if (iE.includes(pat2)) { iE = iE.replace(pat2, inj2); count++; }
console.log('[DO] patch 数:', count);

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
  console.log('[DO] 结果:', JSON.stringify(r).slice(0, 100));
} catch (e) { console.log('[DO] 调用异常:', e.message); }
process.exit(0);
