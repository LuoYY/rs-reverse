const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 79 在 <80 区的 else 兜底。找 '_$jc<80)' 区
let i = c.indexOf('_$jc<80){', 168107);
console.log('_$jc<80){ @' + i);
if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i, i + 400));
// 完整 76-80 区
let j = c.indexOf('_$jc<76){', 168107);
console.log('\n_$jc<76){ @' + j);
if (j >= 0 && j < 347085) console.log('  ...' + c.slice(j, j + 400));
// opcode 372 上下文（恢复用）
let k = c.indexOf('_$jc===372){', 168107);
console.log('\nop372 @' + k + ': ...' + (k >= 0 ? c.slice(k - 30, k + 100) : ''));
