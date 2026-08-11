// 提取完整 JSVMP 闭包：function _$kx(@114272，len 10966，含 _$iR/_$cS 解释器)
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 114272;
let depth = 0, end = -1;
for (let i = c.indexOf('{', start); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const fn = c.slice(start, end + 1);
console.log('闭包长度:', fn.length);
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_closure_full.js', fn);
// 包含的函数清单
for (const v of ['function _$iR(', 'function _$cS(', 'function _$dt(', 'function _$a8(', 'function _$en(', 'function _$fN(', 'function _$eg(', 'function _$hP(', 'function _$gB(', 'function _$pc(', 'function _$er(', 'function _$ce(', 'function _$$6(', 'function _$f2(', 'function _$n6(']) {
  console.log('  含', v, fn.includes(v) ? '✓' : '✗');
}
console.log('\n开头 500:');
console.log(fn.slice(0, 500));
