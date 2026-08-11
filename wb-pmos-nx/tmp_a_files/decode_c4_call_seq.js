// 完整解码 203 次 _$c4 调用：唯一 op + 参数 + 时间线
const calls = require('./nx_c4_calls.json');
console.log('总调用数:', calls.length);
// 解析每条：格式 "op|arg1|arg2..." 或 "op" 或 "op|arr:N|..."
function parseCall(s) {
  const parts = s.split('|');
  return parts;
}
// 统计唯一 op（第一个元素）
const ops = {};
calls.forEach(c => {
  const p = parseCall(c);
  const op = p[0];
  ops[op] = (ops[op] || 0) + 1;
});
console.log('\n唯一 op 数:', Object.keys(ops).length);
Object.entries(ops).sort((a, b) => b[1] - a[1]).forEach(([op, n]) => {
  console.log('  op=' + op + ' ×' + n);
});
// 完整打印所有调用（前 100）
console.log('\n=== 完整调用序列 ===');
calls.forEach((c, i) => {
  console.log('#' + i + ': ' + c.slice(0, 100));
});
