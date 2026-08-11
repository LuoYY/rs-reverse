const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 266/82/169/59/153/345/372 完整 handler（pc11-18）
for (const op of [266, 169, 59, 153, 345, 372, 82, 79, 302]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  if (i < 0) i = c.indexOf('_$jc===' + op + ';', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 30, i + 140));
  console.log();
}
