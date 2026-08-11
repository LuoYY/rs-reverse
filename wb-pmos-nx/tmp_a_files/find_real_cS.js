// 找真正的 _$cS 字节码解释器（带 _$md 参数，_$aq 调用的）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$cS(_\$md, 调用（_$aq 里）
let i = c.indexOf('_$cS(_$md,');
console.log('_$cS(_$md, @' + i, i >= 0 ? c.slice(i - 30, i + 30) : '');
// 所有 function _$cS 定义
i = 0; let n = 0;
while ((i = c.indexOf('function _$cS(', i)) >= 0 && n < 10) {
  console.log('\nfunction _$cS( @' + i + ': ...' + c.slice(i, i + 120));
  i += 13; n++;
}
console.log('function _$cS 总数:', n);
// 找 _$dt 函数（_$md._$gS 字符串转换）
let j = c.indexOf('function _$dt(');
console.log('\nfunction _$dt( @' + j, j >= 0 ? c.slice(j, j + 200) : '');
// 找 _$md 结构（_$gS/_$my/_$iH/_$fL 字段）
let k = c.indexOf('_$gS=');
console.log('\n_$gS= @' + k, k >= 0 ? c.slice(k - 50, k + 50) : '');
