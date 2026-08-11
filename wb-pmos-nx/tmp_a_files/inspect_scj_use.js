// 检查 scj（_$lP[0]? 或 _$$5）在 dynCode 中的使用
const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');
// IIFE 签名
const head = code.slice(0, 120);
console.log('IIFE 头:', head);
// scj 是 _$$5 还是 _$lP[0]？看参数
// (function(_$$5,_$lP){...})  → scj=_$$5, aebi=_$lP
// aebi[1] 使用：_$lP[1]  → aebi 是数组，[1] 是第二段
// scj (_$$5) 怎么用？
console.log('\n_$$5 使用（scj）:');
let idx = 0, count = 0;
while ((idx = code.indexOf('_$$5', idx + 1)) >= 0 && count < 10) {
  count++;
  const ctx = code.slice(Math.max(0, idx - 40), Math.min(code.length, idx + 40));
  console.log('  ...' + ctx.replace(/\n/g, ' ') + '...');
}
// aebi 完整结构：_$lP 有多少段
console.log('\n_$lP[ 使用:');
const lprefs = code.match(/_$lP\[\d+\]/g) || [];
console.log(lprefs.slice(0, 15).join(', '));
