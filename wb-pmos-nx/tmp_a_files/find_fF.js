// 找 _$fF 赋值（Date 相关）+ _$gB 在 JSVMP 的赋值
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$fF 所有出现
let i = 0, n = 0;
while ((i = c.indexOf('_$fF', i)) >= 0 && n < 20) {
  const ctx = c.slice(i - 30, i + 40);
  if (ctx.includes('=') || ctx.includes('Date')) console.log('_$fF @' + i + ': ...' + c.slice(i - 40, i + 50));
  i += 4; n++;
}
// _$gB 赋值（JSVMP）
console.log('\n_$gB 赋值:');
let j = 0, m = 0;
while ((j = c.indexOf('_$gB=', j)) >= 0 && m < 10) {
  console.log('@' + j + ': ...' + c.slice(j - 30, j + 60));
  j += 4; m++;
}
// 在 _$dI 上下文，_$gB 是什么（_$h7 里）
let k = c.indexOf('_$gB=_$er');
console.log('\n_$gB=_$er @' + k);
// _$mS 的 _$gB（运行时值）
console.log('\n_$mS 定义:');
let m2 = c.indexOf('function _$mS(');
if (m2 >= 0) {
  let depth = 0, end = -1;
  for (let x = m2; x < c.length; x++) {
    if (c[x] === '{') depth++;
    else if (c[x] === '}') { depth--; if (depth === 0) { end = x; break; } }
  }
  console.log(c.slice(m2, end + 1));
}
