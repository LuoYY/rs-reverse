// 完整运行 JSVMP：完整 _$iE 闭包 + 全部外部依赖 + 真实参数
// 目标：编码器纯 Node 跑通，产出 base 会话段
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// 1. 完整 _$iE（含 _$kx/_$cS/_$iR/_$$6 等）
const iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_complete.js'), 'utf8');
// 2. 外部依赖：_$iz/_$en/_$fN/_$fX/_$dt（需单独提取正确版本）
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
const dtSrc = extractFn(dyn, '_$dt');  // 字符读取器
// _$fX = throw（简单内联）
const fX = null;

// 3. gS 解码
const gsStart = dyn.indexOf('_$iE("r2mKa');
const seg = dyn.slice(gsStart + 6);
let j = 0, inEscape = false;
for (; j < seg.length; j++) {
  if (inEscape) { inEscape = false; continue; }
  if (seg[j] === '\\') { inEscape = true; continue; }
  if (seg[j] === '"') break;
}
const gs = vm.runInContext('"' + seg.slice(0, j) + '"', vm.createContext({}));
console.log('[FL] gS len:', gs.length);

// 4. 参数（jM/hP 占位可调用函数）
const args = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_iE_v2.json'), 'utf8'))[0];
const k6 = args.k6.vals, hZ = args.hZ.vals, oA = args.oA.vals;
const jM = Array(9).fill((function(){}));
const hP = args.hP.vals.map(x => (function(){}));
// hP[49] 会被 _$iE 覆盖为 md（_$hP[49]=_$aq）——不影响占位

// 5. sandbox
const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: String, _$aN: String.fromCharCode,
  _$ie: String.prototype.charCodeAt,
  _$mT: String.prototype.substr,
};
const ctx = vm.createContext(sandbox);
// 加载依赖（在 iE 前，因为它们被 iE 引用）
for (const [name, src] of [['iz', izSrc], ['en', enSrc], ['fN', fNSrc], ['dt', dtSrc]]) {
  if (src) { try { vm.runInContext(src, ctx); console.log('[FL] ' + name + ' OK'); } catch (e) { console.log('[FL] ' + name + ' 失败:', e.message); } }
}
try { vm.runInContext(iE, ctx); console.log('[FL] iE OK'); } catch (e) { console.log('[FL] iE 失败:', e.message); process.exit(1); }

// 6. 调用
sandbox.__gs = gs; sandbox.__k6 = k6; sandbox.__hZ = hZ; sandbox.__oA = oA; sandbox.__jM = jM; sandbox.__hP = hP;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, __k6, __hZ, [], __oA, __jM, __hP);
      return {ok:true, type: typeof ret, v: String(ret).slice(0, 100)};
    } catch(e) { return {err: String(e && e.message || e), st: String(e.stack).split(String.fromCharCode(10)).slice(0,8)}; }
  })()`, ctx);
  console.log('[FL] 结果:', JSON.stringify(r).slice(0, 400));
} catch (e) { console.log('[FL] 调用异常:', e.message); }
process.exit(0);
