// 找 _$iJ( 调用点（死循环位置）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$iJ( 调用（非定义）
let i = 0, n = 0;
while ((i = c.indexOf('_$iJ(', i)) >= 0 && n < 10) {
  console.log('@' + i + ': ...' + c.slice(i - 120, i + 60));
  console.log('---');
  i += 5; n++;
}
// _$mD[47]( 调用
console.log('\n=== _$mD[47]( ===');
let j = 0, m = 0;
while ((j = c.indexOf('_$mD[47](', j)) >= 0 && m < 10) {
  console.log('@' + j + ': ...' + c.slice(j - 120, j + 60));
  j += 9; m++;
}
