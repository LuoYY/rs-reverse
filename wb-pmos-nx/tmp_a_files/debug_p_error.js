// 定位 _$p_ 报错点：打印 new Array 的长度参数
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_closure.js'), 'utf8');
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

const gsStart = dyn.indexOf('_$iE("r2mKa');
const seg = dyn.slice(gsStart + 6);
let j = 0, inEscape = false;
for (; j < seg.length; j++) {
  if (inEscape) { inEscape = false; continue; }
  if (seg[j] === '\\') { inEscape = true; continue; }
  if (seg[j] === '"') break;
}
const gs = seg.slice(0, j).replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\\\/g, '\\').replace(/\\"/g, '"');

const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_iE_v2.json'), 'utf8'))[0];
const k6 = args.k6.vals, hZ = args.hZ.vals, oA = args.oA.vals;
const jM = Array(9).fill({});
const hP = args.hP.vals.map(x => x && x.f ? (function(){}) : (x && x.o ? {} : x));

// 在 _$p_ 里 new Array(_\$hr+2) 和 new Array(_\$hr) 前打印
let iE2 = iE.replace('_$hr=_$kP(),_$kx=new Array(_$hr+2),',
  '_$hr=_$kP(),console.log("P_ARR1 hr="+_$hr+" pos-ish"),_$kx=new Array(_$hr+2),');
iE2 = iE2.replace('_$hr=_$kP(),_$hi=new Array(_$hr),',
  '_$hr=_$kP(),console.log("P_ARR2 hr="+_$hr),_$hi=new Array(_$hr),');
// 也打印递归深度
iE2 = iE2.replace('function _$p_(){var _$aq,_$_T,_$hr,_$kx,_$hi;',
  'function _$p_(){console.log("P_CALL");var _$aq,_$_T,_$hr,_$kx,_$hi;');

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: String, _$aN: String.fromCharCode,
};
const ctx = vm.createContext(sandbox);
vm.runInContext(iE2, ctx);
vm.runInContext(izSrc, ctx);
vm.runInContext(enSrc, ctx);
vm.runInContext(fNSrc, ctx);
sandbox.__gs = gs; sandbox.__k6 = k6; sandbox.__hZ = hZ; sandbox.__oA = oA; sandbox.__jM = jM; sandbox.__hP = hP;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, __k6, __hZ, [], __oA, __jM, __hP);
      return {ok:true};
    } catch(e) { return {err:String(e && e.message||e)}; }
  })()`, ctx);
  console.log('[PE] 结果:', JSON.stringify(r));
} catch (e) { console.log('[PE] 调用异常:', e.message); }
process.exit(0);
