// 找 _$$p 定义（window 别名？）+ _$as 开头
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$$p 赋值（各种形式）
const pats = ['_$$p=', '_$$p =', 'var _$$p', ';_$$p', '(_$$p', ',_$$p='];
for (const p of pats) {
  let i = c.indexOf(p);
  if (i >= 0) console.log('"' + p + '" @' + i + ': ...' + c.slice(i, i + 80));
}
// _$as 开头（@127206 前）
console.log('\n=== _$as 前 300 ===');
console.log(c.slice(127206 - 300, 127206 + 100));
// _$$p 引用数
console.log('\n_$$p 引用数:', (c.match(/_[$][$]p/g) || []).length);
