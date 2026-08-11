// 调试 opcode 13 的 _$oi
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

// patch opcode 13：_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1]) 前打印
const pat13 = '(_$jb-=2,_$ms=_$jb,_$$6(),_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1]))';
const inj13 = '(_$jb-=2,_$ms=_$jb,_$$6(),console.log("O13 oi="+_$oi+" pc="+(Array.isArray(_$pc)?"arr"+_$pc.length:(typeof _$pc))+" val="+typeof _$pc[_$oi]),_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1]))';
console.log('[D2] op13 匹配:', iE.includes(pat13));
iE = iE.replace(pat13, inj13);
// 也 patch opcode 45（_$hi<=45? ... _$pc=_$$m）
const pat45 = '(_$jb-=2,_$ms=_$jb,_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1]))';
if (iE.includes(pat45)) console.log('[D2] op45 存在');

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
  console.log('[D2] 结果:', JSON.stringify(r).slice(0, 100));
} catch (e) { console.log('[D2] 调用异常:', e.message); }
process.exit(0);
