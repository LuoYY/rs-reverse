// aebi[1] 反汇编内容分析：是否含 cd 派生数据（keys 段）？
// 用反汇编前 40 条 + 找 aebi 中的数组值
const fs = require('fs');
const disasm = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_aebi_disasm_full.txt', 'utf8').split('\n');

console.log('=== 反汇编前 50 条 ===');
for (let i = 0; i < 50; i++) console.log(disasm[i].slice(0, 140));

// 找 aebi 中的常量（数字数组）
console.log('\n=== 含数组字面量的反汇编 ===');
let count = 0;
for (const line of disasm) {
  if (/\[[0-9, ]{5,}\]/.test(line) && count < 15) {
    console.log(line.slice(0, 150));
    count++;
  }
}
