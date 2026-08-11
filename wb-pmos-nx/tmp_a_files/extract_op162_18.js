const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// pc8-10: op39, 18, 162（302 回跳到 11 前执行的段）
for (const op of [39, 18, 162]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 30, i + 150));
  console.log();
}
// opcode 302 所在 296-312 区完整：看 302 是否有条件（else if 链）
let j = c.indexOf('_$jc===300){', 168107);
if (j < 0) j = c.indexOf('_$jc===299){', 168107);
console.log('300 区 @' + j + ': ...' + (j >= 0 ? c.slice(j, j + 400) : ''));
