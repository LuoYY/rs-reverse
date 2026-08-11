// 找 _$hP 的构建逻辑（while(3) 里）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 所有 _$hP= 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$hP=', i)) >= 0 && n < 20) {
  console.log('_$hP= @' + i + ': ...' + c.slice(i - 30, i + 80));
  i += 5; n++;
}
console.log('总数:', n);
// 也找 _$hP[_ （构建元素）
i = 0; n = 0;
while ((i = c.indexOf('_$hP[', i)) >= 0 && n < 10) {
  if (c.slice(i, i + 5) === '_$hP[') {
    const ctx = c.slice(i, i + 80);
    if (ctx.includes('=')) console.log('_$hP[ @' + i + ': ...' + ctx);
  }
  i += 4; n++;
}
