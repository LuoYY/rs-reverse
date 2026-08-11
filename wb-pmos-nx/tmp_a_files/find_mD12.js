const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$mD[12] 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$mD[12]', i)) >= 0 && n < 10) {
  console.log('_$mD[12] @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 8; n++;
}
// op383 handler 完整（_$mD[12][0] 上下文）
let j = c.indexOf('_$jc===383){', 168107);
console.log('\nop383 @' + j + ': ...' + (j >= 0 ? c.slice(j, j + 120) : ''));
// op383 在 pc?（aebi[0][619]=383）
// 看 _$mD[12] 赋值来源：搜 _$mD[12]=
i = 0;
while ((i = c.indexOf('_$mD[12]=', i)) >= 0 && n < 10) {
  console.log('_$mD[12]= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 10; n++;
}
