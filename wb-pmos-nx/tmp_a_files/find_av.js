const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$av 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$av=', i)) >= 0 && n < 10) {
  console.log('_$av= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 5; n++;
}
// op426 handler
let j = c.indexOf('_$jc===426){', 168107);
console.log('\nop426 @' + j + ': ...' + (j >= 0 ? c.slice(j, j + 120) : ''));
// op425 附近
console.log('\nop420-430 区:');
let k = c.indexOf('_$jc<432', 168107);
if (k < 0) k = c.indexOf('_$jc<430', 168107);
console.log(k >= 0 ? c.slice(k, k + 800) : '');
