// 找 _$f3 所有赋值点
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
let i = 0, n = 0;
while ((i = c.indexOf('_$f3=', i)) >= 0 && n < 10) {
  console.log('_$f3= @' + i + ': ...' + c.slice(i - 30, i + 60));
  i += 5; n++;
}
console.log('总数:', n);
// 也找 _$f3[ 修改
i = 0; n = 0;
while ((i = c.indexOf('_$f3[', i)) >= 0 && n < 10) {
  console.log('_$f3[ @' + i + ': ...' + c.slice(i - 20, i + 60));
  i += 5; n++;
}
