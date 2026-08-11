// 找 _$oU[165]（clearInterval）的调用点
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
let i = 0, n = 0;
while ((i = c.indexOf('_$oU[165]', i)) >= 0 && n < 10) {
  console.log('@' + i + ': ...' + c.slice(i - 150, i + 60));
  console.log('---');
  i += 8; n++;
}
