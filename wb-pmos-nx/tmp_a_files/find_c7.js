const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$c7 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$c7=', i)) >= 0 && n < 15) {
  console.log('_$c7= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 5; n++;
}
console.log('_$c7= 总数:', n);
// _$oP[113] 和 _$oP[75] 值
const d = require('./nx_pools_same.json');
console.log('\n_$oP[113] =', JSON.stringify(d.pools.oP[113]));
console.log('_$oP[75] =', JSON.stringify(d.pools.oP[75]));
// 错误点 260474 是 while(3) 内 opcode 337-339 区，_$c7 应由前面 opcode 设置
// 看 op337 handler 上下文（_$c3=_$a2[...]）
console.log('\nopcode 337-343 区:');
let j = c.indexOf('_$jc===336)', 168107);
if (j >= 0) console.log(c.slice(j, j + 500));
