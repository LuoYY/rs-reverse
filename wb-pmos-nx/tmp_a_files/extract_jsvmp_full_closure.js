// 提取 JSVMP 完整闭包（@113283 _$kx 函数开始，含 _$iR/_$cS 解释器及所有辅助）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$kx 函数（@113283，_$md 构建所在）
const start = 113283;
// 找函数结束（平衡括号）
let depth = 0, end = -1;
for (let i = c.indexOf('{', start); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const fn = c.slice(start, end + 1);
console.log('闭包长度:', fn.length);
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_full_closure.js', fn);
console.log('已保存 jsvmp_full_closure.js');
console.log('开头:', fn.slice(0, 300));
// 函数内包含的关键函数
for (const v of ['function _$kx(', 'function _$iR(', 'function _$cS(', 'function _$dt(', 'function _$a8(', 'function _$en(', 'function _$fN(', 'function _$eg(', 'function _$oA(', 'function _$hP(', 'function _$gB(', 'function _$pc(', 'function _$er(']) {
  console.log('  含', v, fn.includes(v) ? '✓' : '✗');
}
