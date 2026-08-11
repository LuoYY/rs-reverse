// v5: 补 _$en（栈池工厂）+ 所有依赖，运行 _$iE 完整解析
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
const enSrc = extractFn(dyn, '_$en', 112057);  // 栈池工厂
const fNSrc = extractFn(dyn, '_$fN');

const gsStart = dyn.indexOf('_$iE("r2mKa');
const seg = dyn.slice(gsStart + 6);
let j = 0, inEscape = false;
for (; j < seg.length; j++) {
  if (inEscape) { inEscape = false; continue; }
  if (seg[j] === '\\') { inEscape = true; continue; }
  if (seg[j] === '"') break;
}
// 用 vm 求值 JS 字符串字面量（JS 引擎解码 \xNN \uNNNN 等全部转义）
const gs = vm.runInContext('"' + seg.slice(0, j) + '"', vm.createContext({}));

const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_iE_v2.json'), 'utf8'))[0];
const k6 = args.k6.vals, hZ = args.hZ.vals, oA = args.oA.vals;
const jM = Array(9).fill((function(){}));
// hP 全部用空函数（对象/函数都可调用）
const hP = args.hP.vals.map(x => (function(){}));

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: String, _$aN: String.fromCharCode,
};
const ctx = vm.createContext(sandbox);
try { vm.runInContext(iE, ctx); console.log('[O5] iE OK'); } catch (e) { console.log('[O5] iE 失败:', e.message); process.exit(1); }
try { vm.runInContext(izSrc, ctx); console.log('[O5] iz OK'); } catch (e) { console.log('[O5] iz 失败:', e.message); }
try { vm.runInContext(enSrc, ctx); console.log('[O5] en OK'); } catch (e) { console.log('[O5] en 失败:', e.message); }
try { vm.runInContext(fNSrc, ctx); console.log('[O5] fN OK'); } catch (e) { console.log('[O5] fN 失败:', e.message); }

sandbox.__gs = gs; sandbox.__k6 = k6; sandbox.__hZ = hZ; sandbox.__oA = oA; sandbox.__jM = jM; sandbox.__hP = hP;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, __k6, __hZ, [], __oA, __jM, __hP);
      return {ok:true, type: typeof ret, v: String(ret).slice(0, 80)};
    } catch(e) { return {err: String(e && e.message || e), st: String(e.stack).split(String.fromCharCode(10)).slice(0,8)}; }
  })()`, ctx);
  console.log('[O5] 结果:', JSON.stringify(r).slice(0, 300));
} catch (e) { console.log('[O5] 调用异常:', e.message); }
process.exit(0);
