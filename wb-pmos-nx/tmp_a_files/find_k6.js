// 找 _$k6 赋值（字节码如何进入解释器）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$k6= 所有赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$k6=', i)) >= 0 && n < 20) {
  console.log('@' + i + ': ...' + c.slice(i - 40, i + 80));
  i += 4; n++;
}
// _$k6 在 _$cS 的上下文（_$aq 运行时函数里如何设置）
// 搜 _$cS 调用（_$md 相关）
let j = c.indexOf('_$cS(_$md');
console.log('\n_$cS(_$md @' + j + ':');
if (j >= 0) console.log(c.slice(j - 200, j + 100));
