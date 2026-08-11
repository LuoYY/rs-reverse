const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 找 _\$jc===79 精确 handler（while(3) 范围 168107-347085）
let i = 0, n = 0;
while ((i = c.indexOf('_$jc===79', i)) >= 0 && n < 10) {
  if (i > 168107 && i < 347085) {
    console.log('op79 @' + i + ': ...' + c.slice(i, i + 80));
  }
  i += 9; n++;
}
// 也看 <80 区的 else（76-79）
let j = c.indexOf('_$jc<80){', 168107);
console.log('\n<80 区 @' + j + ': ...' + (j >= 0 ? c.slice(j, j + 600) : ''));
