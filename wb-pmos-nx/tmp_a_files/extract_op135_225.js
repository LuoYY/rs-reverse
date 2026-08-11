const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 135 handler（设 lj=T 的点）+ opcode 225 handler
for (const op of [135, 225, 383, 126]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 40, i + 160));
  console.log();
}
// opcode 69 上下文（回跳点）
let i69 = c.indexOf('_$jc===69){', 168107);
console.log('op69 @' + i69 + ': ...' + c.slice(i69 - 200, i69 + 80));
