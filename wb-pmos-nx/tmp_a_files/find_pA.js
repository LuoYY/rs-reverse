// 找 _$pA 赋值（内层指令流）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
let i = 0, n = 0;
while ((i = c.indexOf('_$pA=', i)) >= 0 && n < 10) {
  console.log('@' + i + ': ...' + c.slice(i - 100, i + 80));
  console.log('---');
  i += 5; n++;
}
// 也找 var _$pA
let j = c.indexOf('_$pA;');
console.log('_$pA 声明 @' + j);
// _$hF 函数定义（_$pA 的父函数）
let k = c.indexOf('function _$hF(');
console.log('function _$hF @' + k);
if (k >= 0) console.log('_$hF 签名:', c.slice(k, k + 100));
