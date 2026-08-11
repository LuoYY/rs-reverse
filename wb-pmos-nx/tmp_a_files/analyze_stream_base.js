// 分析执行流：定位 base 构造段（pc 对应反汇编指令）
const trace = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_stream_trace.json');
const fs = require('fs');
const disasm = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_aebi_disasm_full.txt', 'utf8').split('\n');

console.log('执行流总条数:', trace.length);
// 统计 pc 分布
const pcCount = {};
for (const t of trace) pcCount[t.pc] = (pcCount[t.pc] || 0) + 1;
console.log('不同 pc 数:', Object.keys(pcCount).length);

// 关键段：尾部的执行流（base 构造应该在尾部）
console.log('\n=== 尾部 300 条执行流 pc ===');
trace.slice(-300).forEach((t, i) => console.log(i, 'pc=' + t.pc, 'op=' + t.op));

// 打印反汇编中 pc 2100-2160 段
console.log('\n=== 反汇编 pc 2070-2160 ===');
for (const line of disasm) {
  const m = line.match(/^pc=(\d+)/);
  if (m && +m[1] >= 2070 && +m[1] <= 2160) console.log(line);
}
