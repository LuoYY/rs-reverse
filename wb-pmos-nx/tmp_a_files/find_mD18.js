const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$mD[18] 赋值
let i = 0, n = 0;
while ((i = c.indexOf('_$mD[18]', i)) >= 0 && n < 10) {
  console.log('_$mD[18] @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 8; n++;
}
// _$mD 长度设置（op348 _$mD.length=69）
// opcode 320 handler（_$mD[18].jf）
let j = c.indexOf('_$jc===320){', 168107);
console.log('\nop320 @' + j + ': ...' + (j >= 0 ? c.slice(j, j + 100) : ''));
// op320 在 pc?
const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
a0.forEach((v, i) => { if (v === 320) console.log('op320 pc[' + i + ']'); });
a0.forEach((v, i) => { if (v === 18) console.log('op18 pc[' + i + ']'); });
// opcode 18 后哪个设 _$mD[18]？搜所有 _$mD[ 索引 18 附近的
// 看 op 320 之前的 opcode 是否设 _$mD[18]
console.log('\n_$mD[18].jf 需要 _$mD[18] 是对象');
