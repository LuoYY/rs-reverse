const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 79：可能不在 <444 区，或在 <256 区。搜所有 '_$jc===79' 出现
let i = 0, n = 0;
while ((i = c.indexOf('_$jc===79', i)) >= 0 && n < 6) {
  console.log('op79 @' + i + ': ...' + c.slice(i - 30, i + 120));
  i += 8; n++;
}
// 79 可能在 <256 区（76-79 或 79-80）
console.log('\n--- 76-84 区 ---');
let j = c.indexOf('_$jc<84', 168107);
if (j < 0) j = c.indexOf('_$jc<80', 168107);
console.log('@' + j + ': ' + (j >= 0 ? c.slice(j, j + 600) : ''));
