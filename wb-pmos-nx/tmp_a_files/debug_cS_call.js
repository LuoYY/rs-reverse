// 调试 _$cS 调用：捕获 _$kx 结构（函数链）+ 报错时 _$oi/_$pc
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
// 主函数 _$kx（@114483）
const kxSrc = extractFn(dyn, '_$kx', 114483);

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

// patch _$cS：入口记录 _$kx 结构
let cS = fs.readFileSync(path.join(__dirname, 'jsvmp_real_interp.txt'), 'utf8');
cS = cS.replace('function _$cS(_$aq,_$_T,_$hr,_$kx){var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS',
  'function _$cS(_$aq,_$_T,_$hr,_$kx){try{console.log("cS kx3len="+(_$kx[3]?._$length||_$kx[3].length)+" kx2type="+typeof _$kx[2]);}catch(e){console.log("cS cap err",e.message);}var _$md,_$hi,_$pc,_$oi,_$ms,_$_R,_$fZ,_$gx,_$gB,_$pC,_$f1,_$fD,_$ax,_$jb,_$p2;_$gx=_$aq._$gS');
// patch opcode 47 调用（_$pc[_$oi]）前打印
cS = cS.replace('_$hi<=51?_$hi<=49?(_$jb-=2,_$ms=_$jb,_$$6(),_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1],',
  '_$hi<=51?_$hi<=49?(_$jb-=2,_$ms=_$jb,_$$6(),try{console.log("call oi="+_$oi+" pc="+typeof _$pc+" pcoi="+typeof _$pc[_$oi]+" pcArr="+Array.isArray(_$pc));}catch(e){console.log("c1",e.message);}_$ms=_$pc[_$oi](_$ax[_$ms],_$ax[_$ms+1],');

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
// _$kx 主函数（在 iE 之后定义，供 _$iE 调用）——但 iE 里的 _\$iE 引用外层 _\$kx
// 先加载 kxSrc（_$kx 定义），再加载 iE？顺序：_$kx 和 _$iE 都定义后 _$iE 才能调 _\$kx
vm.runInContext(kxSrc, ctx);
console.log('[DC] 全部加载');
sandbox.__gs = gs; sandbox.__k6 = k6; sandbox.__hZ = hZ; sandbox.__oA = oA; sandbox.__jM = jM; sandbox.__hP = hP;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, __k6, __hZ, [], __oA, __jM, __hP);
      return {ok:true};
    } catch(e) { return {err:String(e && e.message||e)}; }
  })()`, ctx);
  console.log('[DC] 结果:', JSON.stringify(r));
} catch (e) { console.log('[DC] 调用异常:', e.message); }
process.exit(0);
