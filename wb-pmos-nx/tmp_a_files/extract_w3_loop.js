// 提取 dynCode 中所有 while(1) 循环代码（w3 死循环分析）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// 找所有 while(1){ 及其上下文
let idx = 0, n = 0;
while ((idx = c.indexOf('while(1){', idx)) >= 0 && n < 20) {
  n++;
  const ctx = c.slice(idx - 120, idx + 300).replace(/\n/g, ' ');
  console.log('=== while(' + n + ') @' + idx + ' ===');
  console.log('前:' + c.slice(idx - 150, idx).replace(/\n/g, ' '));
  console.log('后:' + c.slice(idx, idx + 400).replace(/\n/g, ' '));
  console.log();
  idx += 9;
}
console.log('共找到', n, '个 while(1)');
