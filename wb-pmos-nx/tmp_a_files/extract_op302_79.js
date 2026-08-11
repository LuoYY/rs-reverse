const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 302 handler（pc19 回跳 11 的点）+ opcode 79
for (const op of [302, 79]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 60, i + 200));
  console.log();
}
// aebi[0][11:20] 实际值（对照轨迹 pc11-19）
const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
console.log('aebi[0][11:20]:', a0.slice(11, 20).join(','));
