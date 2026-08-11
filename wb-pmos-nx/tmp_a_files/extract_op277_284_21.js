const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// sdenv 真实路径：pc115 op4(T), pc117 op277(F), pc199 op21(F), pc200 op284(F)
// 看这些 opcode 在 buildEnv dynCode 的 handler
for (const op of [4, 277, 21, 284]) {
  let i = c.indexOf('_$jc===' + op + '){', 168107);
  console.log('op' + op + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 30, i + 160));
  console.log();
}
