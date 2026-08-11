// 单步调试 _$hr 解析：记录 _$ju 消费位置 + _$p_ 起始位置
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
const enSrc = extractFn(dyn, '_$en');
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

// 在 _$hr 里 _$iz 创建后加日志（_$ju 消费 + _$p_ 前位置）
// _$hr: ..._$pE=_$iz(_$aq,_$_T),_$kP=_$pE._$bA,_$eg=_$pE._$ht,_$kx=_$eg,_$hr._$as=_$k6,_$hr._$db=_$nD,_$hr._$_0=_$hZ,_$hr._$g9=_$pE._$ju().concat(_$pE._$ju()),_$hr._$m3=_$kP(),_$hr._$fB=_$kP(),_$hr._$j5=_$p_();
// 插桩：记录 _$pE._$cU()（当前位置）
let iE2 = iE.replace('_$pE=_$iz(_$aq,_$_T),_$kP=_$pE._$bA,_$eg=_$pE._$ht,_$kx=_$eg,',
  '_$pE=_$iz(_$aq,_$_T),_$kP=_$pE._$bA,_$eg=_$pE._$ht,_$kx=_$eg,console.log("HR_START pos="+_$pE._$cU()),');
iE2 = iE2.replace('_$hr._$g9=_$pE._$ju().concat(_$pE._$ju()),_$hr._$m3=_$kP(),_$hr._$fB=_$kP(),',
  '_$hr._$g9=_$pE._$ju().concat(_$pE._$ju()),console.log("HR_G9 pos="+_$pE._$cU()+" g9len="+_$hr._$g9.length),_$hr._$m3=_$kP(),_$hr._$fB=_$kP(),console.log("HR_M3FB pos="+_$pE._$cU()+" m3="+_$hr._$m3+" fB="+_$hr._$fB),');
iE2 = iE2.replace('_$hr._$j5=_$p_();return _$hr;',
  'console.log("HR_P_ pos="+_$pE._$cU()),_$hr._$j5=_$p_(),console.log("HR_DONE pos="+_$pE._$cU());return _$hr;');
// _$p_ 内记录 iH/fL 值
iE2 = iE2.replace('_$aq={},_$aq._$iH=_$kP(),_$aq._$fL=_$kP(),_$aq._$gS=_$eg(),',
  '_$aq={},_$aq._$iH=_$kP(),console.log("P_ iH="+_$aq._$iH),_$aq._$fL=_$kP(),console.log("P_ fL="+_$aq._$fL),_$aq._$gS=_$eg(),console.log("P_ gSlen="+_$aq._$gS.length),');

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
      return {ok:true, v:String(ret).slice(0,80)};
    } catch(e) { return {err:String(e && e.message||e), st:String(e.stack).split(String.fromCharCode(10)).slice(0,5)}; }
  })()`, ctx);
  console.log('[DH] 结果:', JSON.stringify(r).slice(0, 200));
} catch (e) { console.log('[DH] 调用异常:', e.message); }
process.exit(0);
