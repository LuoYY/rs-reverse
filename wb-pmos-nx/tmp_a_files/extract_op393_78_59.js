const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
for (const op of [393, 78, 59, 166, 100, 275, 380, 311]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 40, i + 180));
  console.log();
}
