const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 133587 附近精确代码
console.log('=== 133587 附近 ===');
console.log(c.slice(133480, 133620));
console.log();
// _$ll 赋值
const pats = ['_$ll=', 'var _$ll', ';_$ll', '_$ll=['];
pats.forEach(p => {
  let i = 0, n = 0;
  while ((i = c.indexOf(p, i)) >= 0 && n < 3) {
    console.log(p + ' @' + i + ': ...' + c.slice(i, i + 90));
    i += 4; n++;
  }
});
console.log();
// _$ll 引用数
console.log('_$ll 引用数:', (c.match(/_[$]ll/g) || []).length);
