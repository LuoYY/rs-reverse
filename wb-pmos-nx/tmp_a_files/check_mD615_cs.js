// 确认 _$mD[615] 内部调用 _$cS（JSVMP 字节码解释器）而非 _$h7
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$mD[615] 赋值
let i = c.indexOf('_$mD[615]=');
console.log('_$mD[615]= @' + i, i >= 0 ? c.slice(i - 40, i + 120) : '');
// _$cS 定义
let j = c.indexOf('function _$cS(');
console.log('\nfunction _$cS( @' + j, j >= 0 ? c.slice(j, j + 200) : '');
// _$cS 调用点
let k = 0, n = 0;
while ((k = c.indexOf('_$cS(', k)) >= 0 && n < 8) {
  console.log('_$cS( @' + k + ': ...' + c.slice(k - 50, k + 40));
  k += 4; n++;
}
