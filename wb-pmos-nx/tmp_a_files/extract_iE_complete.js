// 提取完整 _$iE（@112785，平衡括号），它内部含 _$kx/@114483 + _$cS 解释器
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 112785;
let depth = 0, end = -1;
for (let i = c.indexOf('{', start); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const fn = c.slice(start, end + 1);
console.log('完整 _$iE 长度:', fn.length);
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_iE_complete.js', fn);
// 包含的函数
for (const v of ['function _$hr(', 'function _$p_(', 'function _$kx(', 'function _$cS(', 'function _$iR(', 'function _$$6(', 'function _$kp(', 'function _$fX(', 'function _$dt(']) {
  console.log('  含', v, fn.includes(v) ? '✓' : '✗');
}
// 外部引用（_\$iz/_\$en/_\$fN 在外部）
for (const v of ['_\$iz(', '_\$en(', '_\$fN(', '_\$dt(', '_\$fX(']) {
  if (fn.includes(v)) console.log('  引用', v);
}
