// v4: 注入捕获的参数（jM/hP 用占位替换函数），运行 _$iE
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

// gS
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

// 捕获的参数
const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_iE_v2.json'), 'utf8'))[0];
const k6 = args.k6.vals;
const hZ = args.hZ.vals;
const oA = args.oA.vals;
const jM = Array(9).fill({}); // 占位（9 个对象）
const hP = args.hP.vals.map(x => x && x.f ? (function(){}) : (x && x.o ? {} : x)); // 函数→空函数, 对象→{}

console.log('[O4] k6=' + k6.length + ' hZ=' + hZ.length + ' oA=' + oA.length + ' jM=' + jM.length + ' hP=' + hP.length);

const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: String,
  _$aN: String.fromCharCode,
};
const ctx = vm.createContext(sandbox);
vm.runInContext(iE, ctx);
vm.runInContext(izSrc, ctx);
vm.runInContext(enSrc, ctx);
vm.runInContext(fNSrc, ctx);

// 注入参数
sandbox.__gs = gs;
sandbox.__k6 = k6; sandbox.__hZ = hZ; sandbox.__oA = oA; sandbox.__jM = jM; sandbox.__hP = hP;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, __k6, __hZ, [], __oA, __jM, __hP);
      return {ok:true, type: typeof ret, v: String(ret).slice(0, 100)};
    } catch(e) { return {err: String(e && e.message || e), st: String(e.stack).split(String.fromCharCode(10)).slice(0,8)}; }
  })()`, ctx);
  console.log('[O4] 结果:', JSON.stringify(r).slice(0, 400));
} catch (e) { console.log('[O4] 调用异常:', e.message); }
process.exit(0);
