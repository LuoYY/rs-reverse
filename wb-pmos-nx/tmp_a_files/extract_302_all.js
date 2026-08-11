const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 所有 _$oL+=-9 出现位置（op302 回跳）
let i = 0, n = 0;
while ((i = c.indexOf('_$oL+=-9;', i)) >= 0 && n < 30) {
  console.log('@' + i + ': ...' + c.slice(i - 60, i + 20));
  i += 7; n++;
}
console.log('总数(前30):', n);
