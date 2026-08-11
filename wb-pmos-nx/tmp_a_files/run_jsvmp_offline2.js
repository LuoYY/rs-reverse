// v2: 用真实 gS + 简化参数测试 _$iE 闭包可运行性
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const iE = fs.readFileSync(path.join(__dirname, 'jsvmp_iE_closure.js'), 'utf8');

// 从 dynCode 提取真实 gS 字符串（转义形式 → 实际字符）
const dyn = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');
const gsStart = dyn.indexOf('_$iE("r2mKa');
const seg = dyn.slice(gsStart + 6);
let j = 0, inEscape = false;
for (; j < seg.length; j++) {
  if (inEscape) { inEscape = false; continue; }
  if (seg[j] === '\\') { inEscape = true; continue; }
  if (seg[j] === '"') break;
}
const gsLit = seg.slice(0, j);
// 解码 \xNN 和 \uNNNN
function decodeEscapes(s) {
  return s.replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}
const gs = decodeEscapes(gsLit);
console.log('[O2] gS 解码后长度:', gs.length, '头:', JSON.stringify(gs.slice(0, 20)));

// 简化参数（空数组测试可运行性）
const sandbox = {
  Array, Date, RegExp, String, Math, JSON, console,
  _$a8: Array, _$fF: Date, _$cD: RegExp,
  _$a2: { location: { href: '' }, navigator: { userAgent: '' }, document: {} },
  _$av: { fromCharCode: String.fromCharCode },
};
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(iE, ctx, { filename: 'iE.js' });
  console.log('[O2] _$iE 定义 OK');
} catch (e) { console.log('[O2] 加载失败:', e.message, e.stack.split('\n').slice(0, 4).join('\n')); process.exit(1); }

// 调 _$iE
sandbox.__gs = gs;
try {
  const r = vm.runInContext(`(function(){
    try {
      var ret = _$iE(__gs, [], [], [], [], [], []);
      return {ok:true, type: typeof ret, v: String(ret).slice(0, 80)};
    } catch(e) { return {err: String(e && e.message || e), st: String(e.stack).split(String.fromCharCode(10)).slice(0,6)}; }
  })()`, ctx);
  console.log('[O2] 结果:', JSON.stringify(r).slice(0, 300));
} catch (e) { console.log('[O2] 调用异常:', e.message); }
process.exit(0);
