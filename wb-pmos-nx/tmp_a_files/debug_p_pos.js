// 打印 _$p_ 每次调用的读取位置和长度值
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_closure.js'), 'utf8');
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

// 替换 _$p_ 为带日志版本（记录每次读的长度 + 记录递归深度限制）
const oldP = 'function _$p_(){var _$aq,_$_T,_$hr,_$kx,_$hi;_$aq={},_$aq._$iH=_$kP(),_$aq._$fL=_$kP(),_$aq._$gS=_$eg(),_$hr=_$kP(),_$kx=new _$a8(_$hr+2);for(_$_T=0;_$_T<_$hr;_$_T++ )_$kx[_$_T+2]=_$p_();_$hr=_$kP(),_$hi=new _$a8(_$hr);for(_$_T=0;_$_T<_$hr;_$_T++ )_$hi[_$_T]=_$p_();_$aq._$my=_$kx,_$aq._$jR=_$hi;return _$aq;}';
const newP = 'function _$p_(){console.log("P_ iH="+_$kP()+" fL="+_$kP()+" gSL="+(_$eg().length));var _$aq,_$_T,_$hr,_$kx,_$hi;_$aq={},_$aq._$iH=arguments.callee.__lastI,_$aq._$fL=arguments.callee.__lastF,_$aq._$gS=arguments.callee.__lastG,_$hr=_$kP(),console.log("P_ myN="+_$hr);_$kx=new _$a8(_$hr+2);for(_$_T=0;_$_T<_$hr;_$_T++ )_$kx[_$_T+2]=_$p_();_$hr=_$kP(),console.log("P_ jRN="+_$hr);_$hi=new _$a8(_$hr);for(_$_T=0;_$_T<_$hr;_$_T++ )_$hi[_$_T]=_$p_();_$aq._$my=_$kx,_$aq._$jR=_$hi;return _$aq;}';
if (iE.indexOf(oldP) >= 0) {
  iE = iE.replace(oldP, newP);
  console.log('[PP] _$p_ 日志版 OK');
} else console.log('[PP] ✗ 模式不匹配');

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: String, _$aN: String.fromCharCode,
};
const ctx = vm.createContext(sandbox);
vm.runInContext(iE, ctx);
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
  console.log('[PP] 结果:', JSON.stringify(r));
} catch (e) { console.log('[PP] 调用异常:', e.message); }
process.exit(0);
