// 提取 _$h7 完整函数体（JSVMP 解释器工厂）和它的外部依赖
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$h7 定义
let i = c.indexOf('function _$h7(');
console.log('function _$h7( @' + i);
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  const fn = c.slice(i, end + 1);
  console.log('_$h7 长度:', fn.length);
  console.log('=== _$h7 完整 ===');
  console.log(fn);
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/fn__$h7.txt', fn);
}
// 找 _$h7 的调用点（谁调用 _$h7）
let j = 0, n = 0;
while ((j = c.indexOf('_$h7(', j)) >= 0 && n < 10) {
  console.log('\n_$h7( @' + j + ': ...' + c.slice(j - 60, j + 40));
  j += 4; n++;
}
