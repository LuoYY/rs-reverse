// 检查 aebi[1] 是否依赖真实环境（window/document 等）
// 从反汇编中搜索环境访问
const fs = require('fs');
const disasm = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_aebi_disasm_full.txt', 'utf8').split('\n');
console.log('反汇编行数:', disasm.length);

// 统计引用 window/document/navigator 的行
let winCount = 0, docCount = 0, navCount = 0;
for (const line of disasm) {
  if (/window|Window/i.test(line)) winCount++;
  if (/document/i.test(line)) docCount++;
  if (/navigator/i.test(line)) navCount++;
}
console.log('window 引用:', winCount);
console.log('document 引用:', docCount);
console.log('navigator 引用:', navCount);

// 找 base 构造相关（59/179 头或 huffman）
console.log('\n=== 含 59,148 或 179,0 或 k0 的行 ===');
let count = 0;
for (const line of disasm) {
  if (/59,148|179,0|k0=|numarr|huff/i.test(line) && count < 10) {
    console.log(line.slice(0, 120));
    count++;
  }
}

// 打印尾部 pc 2100-2160（base 构造段）
console.log('\n=== pc 2100-2160 ===');
for (const line of disasm) {
  const m = line.match(/^pc=(\d+)/);
  if (m && +m[1] >= 2100 && +m[1] <= 2160) console.log(line.slice(0, 150));
}
