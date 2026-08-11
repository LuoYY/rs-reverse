// 提取 _$f1（JSVMP opcode 处理器函数表）和 _$ie/_$k6 初始化
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// _$f1= 定义
let i = c.indexOf('_$f1=');
console.log('_$f1= @' + i);
if (i >= 0) console.log(c.slice(i - 30, i + 500));
console.log();

// _$f1 引用
let j = 0, n = 0;
while ((j = c.indexOf('_$f1[', j)) >= 0 && n < 20) {
  console.log('_$f1[ @' + j + ': ' + c.slice(j - 10, j + 60));
  j += 4; n++;
}
console.log();

// _$ie 初始化（字节码数组）
let k = c.indexOf('_$ie=');
console.log('_$ie= @' + k);
if (k >= 0) console.log(c.slice(k - 30, k + 200));
// 在 _$pC 中 _$ie 是什么？
let m = c.indexOf('_$ie[');
console.log('\n_$ie[ @' + m + ': ' + c.slice(m - 30, m + 80));
