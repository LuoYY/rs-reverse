// 找 _$mD[615] 的定义：函数池第 615 个函数
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
// 搜索 615 出现
let idx = 0, n = 0;
while ((idx = c.indexOf('615', idx)) >= 0 && n < 30) {
  const ctx = c.slice(Math.max(0, idx - 40), Math.min(c.length, idx + 60));
  if (ctx.includes('_$mD') || ctx.includes('615=') || ctx.includes('[615]')) {
    console.log('@' + idx + ': ' + ctx.replace(/\n/g, ' '));
    n++;
  }
  idx += 3;
}
// 找 _$mD 数组的构建方式
idx = c.indexOf('_$mD=');
console.log('\n_$mD= @' + idx + ': ' + (idx >= 0 ? c.slice(idx, idx + 200) : 'N/A'));
// 找函数池构建（scj 相关）
idx = c.indexOf('_$$p');
if (idx >= 0) console.log('_$$p @' + idx + ': ' + c.slice(idx, idx + 200));
