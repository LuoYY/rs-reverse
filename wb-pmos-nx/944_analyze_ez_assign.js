/**
 * 944_analyze_ez_assign.js
 * 找 _\$ez 在 _\$c4 内的赋值（opcode 6 前）
 * 关键：_\$ez 45115 编码字符串的来源
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const c4Idx = body.indexOf('function _$c4');
const c4 = body.substring(c4Idx, c4Idx + 300000);

// 找 _\$ez= 赋值（_$c4 内）
console.log('=== _\$ez= 赋值（_$c4 内） ===');
let idx = 0, count = 0;
while ((idx = c4.indexOf('_\$ez=', idx)) >= 0) {
  console.log('@' + (c4Idx + idx) + ': ' + c4.substring(idx - 30, idx + 60).replace(/\n/g, ' ').substring(0, 90));
  idx += 4;
  count++;
  if (count > 20) break;
}
console.log('_\$ez= 赋值数:', count);

// 找 _\$ez 初始（var 声明）
console.log('\n=== _\$ez var ===');
const varEZ = c4.indexOf('var _$ez');
console.log('var _$ez @', varEZ >= 0 ? c4Idx + varEZ : -1);

// 找 opcode 6 前 _\$ez 的赋值（程序流中）
// aebi[1] 中 opcode 6 @9，之前有 opcode 1685, 280, 1536 等
// 但这些 opcode 处理 _\$ez 吗？
// 找 _\$c4 内 _\$ez 的所有引用（前 30）
console.log('\n=== _\$ez 引用（_$c4 内前 30） ===');
idx = 0;
count = 0;
while ((idx = c4.indexOf('_\$ez', idx)) >= 0) {
  const ctx = c4.substring(idx - 30, idx + 30).replace(/\n/g, ' ');
  console.log('@' + (c4Idx + idx) + ': ' + ctx.substring(0, 60));
  idx += 4;
  count++;
  if (count > 30) break;
}