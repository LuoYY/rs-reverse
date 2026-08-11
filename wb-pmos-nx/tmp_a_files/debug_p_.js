// 单步调试 _$p_ 递归：patch _$p_ 记录 _$kP() 读值
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

// 在 _$hr 的 _$p_ 函数里加日志（记录 _$kP 读值 + 递归深度）
let iE2 = iE.replace('function _$p_(){var _$aq,_$_T,_$hr,_$kx,_$hi;_$aq={},_$aq._$iH=_$kP(),',
  'function _$p_(){console.log("DEP"+((window.__dep=(window.__dep||0)+1))+":kP="+_$kP());if(window.__dep>200)throw new Error("DEPTH");var _$aq,_$_T,_$hr,_$kx,_$hi;_$aq={},_$aq._$iH=_$kP(),');
iE2 = iE2.replace('_$aq._$my=_$kx,_$aq._$jR=_$hi;return _$aq;}',
  '_$aq._$my=_$kx,_$aq._$jR=_$hi;window.__dep--;return _$aq;}');

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: { fromCharCode: String.fromCharCode },
  window: {},
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
  console.log('[DP] 结果:', JSON.stringify(r).slice(0, 300));
  const log = vm.runInContext('typeof __pLog!=="undefined"?__pLog:null', ctx);
  console.log('[DP] 递归日志:', log ? log.join(', ') : 'null');
} catch (e) { console.log('[DP] 调用异常:', e.message); }
process.exit(0);
