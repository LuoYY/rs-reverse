const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_p302_patched.js', 'utf8');
// 所有 _$a2 赋值（整个文件）
let i = 0, n = 0;
while ((i = c.indexOf('_$a2=', i)) >= 0 && n < 40) {
  console.log('@' + i + ': ...' + c.slice(i - 40, i + 80));
  i += 5; n++;
}
console.log('总数:', n);
// 错误点 255663 所属函数
const before = c.slice(0, 255663);
let lastFn = before.lastIndexOf('function ');
console.log('\n255663 所属函数 @' + lastFn + ': ' + c.slice(lastFn, lastFn + 100));
