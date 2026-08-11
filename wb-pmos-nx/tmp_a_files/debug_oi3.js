// 调试 opcode 13：打印 _$oi（用 script 文件方式避免 shell 转义）
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

// 在 opcode 13 调用前打印（用唯一子串）
const target = '_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1]';
const repl = 'console.log("O13 oi="+_$oi+" pc="+typeof _$pc+" len="+(_$pc&&_$pc.length)+" v="+typeof _$pc[_$oi]),_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1]';
// 只替换第一次出现（opcode 13），其他保留
const firstIdx = iE.indexOf(target);
console.log('[D3] target @' + firstIdx);
if (firstIdx >= 0) {
  iE = iE.slice(0, firstIdx) + repl + iE.slice(firstIdx + target.length);
  console.log('[D3] patched');
}

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
  console.log('[D3] 结果:', JSON.stringify(r).slice(0, 100));
} catch (e) { console.log('[D3] 调用异常:', e.message); }
process.exit(0);
