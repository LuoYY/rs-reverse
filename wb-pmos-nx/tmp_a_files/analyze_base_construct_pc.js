// 分析 aebi[1] 执行流：base 构造的 opcode 序列
// 找：base 数组（59/179 头）构造发生在哪些 pc，涉及哪些 opcode
const fs = require('fs');
const trace = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_stream_trace.json', 'utf8'));

console.log('执行流条数:', trace.length);
// 统计 opcode 分布（前 30 高频）
const opCount = {};
trace.forEach(t => opCount[t.op] = (opCount[t.op] || 0) + 1);
const top = Object.entries(opCount).sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log('\n高频 opcode:', top.map(([op, n]) => op + '×' + n).join(', '));

// pc 分布范围
const pcs = trace.map(t => t.pc);
console.log('pc 范围:', Math.min(...pcs), '-', Math.max(...pcs), '不同 pc:', new Set(pcs).size);

// 关键段：执行流中 base 构造（可能靠近尾部，在 XOR 循环之前）
// XOR 循环 pc=1582-1586，base 构造在它之前
console.log('\n=== XOR 循环（pc 1580-1600）前后的执行流 ===');
trace.forEach((t, i) => {
  if (t.pc >= 1575 && t.pc <= 1600) console.log(i, 'pc=' + t.pc, 'op=' + t.op);
});
