// 提取最外层 JSVMP 闭包：function _$iE(@112785，len 12454)
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 112785;
let depth = 0, end = -1;
for (let i = c.indexOf('{', start); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const fn = c.slice(start, end + 1);
console.log('_$iE 闭包长度:', fn.length);
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_iE_closure.js', fn);
// 包含的函数
for (const v of ['function _$iR(', 'function _$cS(', 'function _$dt(', 'function _$a8(', 'function _$en(', 'function _$fN(', 'function _$eg(', 'function _$hP(', 'function _$gB(', 'function _$pc(', 'function _$er(', 'function _$ce(', 'function _$$6(', 'function _$f2(', 'function _$n6(', 'function _$kx(', 'function _$p_(']) {
  console.log('  含', v, fn.includes(v) ? '✓' : '✗');
}
console.log('\n开头 400:');
console.log(fn.slice(0, 400));
