const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$d5 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$d5=', i)) >= 0 && n < 15) {
  console.log('_$d5= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 5; n++;
}
console.log('_$d5= 总数:', n);
// _$oU[51] 值
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const oU = t._$oU.val || t._$oU;
console.log('_$oU[51] =', JSON.stringify(oU[51]));
// op340 handler
let j = c.indexOf('_$jc===340){', 168107);
console.log('op340 @' + j + ': ...' + (j >= 0 ? c.slice(j, j + 100) : ''));
