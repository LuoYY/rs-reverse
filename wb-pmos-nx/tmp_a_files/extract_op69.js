const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 69 handler 在 <256 区（64-256 范围）
// 找 69 handler：在 while(3) 范围 168107-347085 内搜
// op69 在 <128 或 <64-256 之间。搜 '_$jc===69' 或 '===69'
for (const pat of ['_$jc===69', '69){', '_$jc<72', '_$jc<70', '===69']) {
  let i = c.indexOf(pat, 168107);
  console.log(pat + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 50, i + 200));
}
// 直接搜 '_$oL+=-24' 上下文（620→596 = -24）
let idx = c.indexOf('_$oL+=-24', 168107);
console.log('\n_$oL+=-24 @' + idx);
if (idx >= 0) console.log('  ...' + c.slice(idx - 300, idx + 100));
