// 分析 203 次 _$c4 调用序列：还原 base 生成的写入顺序
// 核心：识别哪些调用写入 _$kt（base 数组）
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_c4_calls.json');
console.log('调用数:', calls.length);

// 分类调用（按第一个参数 = opcode）
console.log('\n=== 调用 opcode 频率 ===');
const freq = {};
calls.forEach(c => {
  const op = c.split('|')[0];
  freq[op] = (freq[op] || 0) + 1;
});
Object.entries(freq).sort((a, b) => b[1] - a[1]).forEach(([op, n]) => {
  console.log('op=' + op + ' ×' + n);
});

// 完整调用序列（关键段）
console.log('\n=== 完整调用序列 ===');
calls.forEach((c, i) => {
  if (i < 20 || i > calls.length - 30) console.log('#' + i + ': ' + c.slice(0, 100));
  else if (i === 20) console.log('...');
});

// 重点：找 base 写入相关（含 arr: 参数的调用，特别是 143/209 编码）
console.log('\n=== base 编码相关调用（arr 参数） ===');
calls.forEach((c, i) => {
  if (c.includes('arr:')) console.log('#' + i + ': ' + c.slice(0, 120));
});
