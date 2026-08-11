// 剥出实际执行代码：执行流(2220 opcode) × opcode 语义树 → 实际 JS 动作
// 目标：识别 base 生成的关键动作序列
const fs = require('fs');
const sem = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_op_semantics_full.json');
const stream = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_stream_trace.json');

// stream_trace 是 [{pc, op}] 还是 [op]？
console.log('stream 类型:', Array.isArray(stream) ? 'array[' + stream.length + ']' : typeof stream);
if (Array.isArray(stream)) {
  console.log('首元素:', JSON.stringify(stream[0]).slice(0, 100));
  console.log('尾元素:', JSON.stringify(stream[stream.length - 1]).slice(0, 100));
}

// opcode 语义树：opcode → JS 代码
// sem[op] = "JS code"（字符串）
console.log('\n=== 语义树样例 ===');
[1285, 620, 812, 6, 393].forEach(op => {
  console.log('op=' + op + ' → ' + sem[op].slice(0, 100));
});

// 统计执行流中各 opcode 出现频率（找 base 生成的核心 opcode）
console.log('\n=== 执行流 opcode 频率（前 25） ===');
if (Array.isArray(stream) && stream[0] && typeof stream[0] === 'object') {
  const ops = stream.map(t => t.op);
  const freq = {};
  ops.forEach(op => { freq[op] = (freq[op] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 25).forEach(([op, cnt]) => {
    console.log('op=' + op + ' ×' + cnt + ' → ' + sem[op].slice(0, 80));
  });
} else {
  console.log('stream 不是对象数组，是裸 opcode 数组？');
  console.log('前 10:', stream.slice(0, 10).join(','));
}
