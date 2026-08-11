const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// pc608-620 的 opcode handler（哪些改 _$lj）
// 608:225, 609:0, 610:205, 611:388, 612:423, 613:386, 614:119, 615:337, 616:86, 617:410, 618:31, 619:383, 620:69
for (const op of [225, 0, 205, 388, 423, 386, 119, 337, 86, 410, 31, 383, 69, 135]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  if (i < 0) i = c.indexOf('_$jc===' + op + ';', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 20, i + 130));
  console.log();
}
