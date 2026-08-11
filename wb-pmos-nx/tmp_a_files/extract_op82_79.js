const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// pc17 的 op82（跳+2 到 19）和 pc19 的 op79
for (const op of [82, 79, 266, 302]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 40, i + 150));
  console.log();
}
// aebi[0][11:25] 完整
const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
console.log('aebi[0][10:25]:');
for (let i = 10; i < 25; i++) console.log('  [' + i + ']=' + a0[i]);
