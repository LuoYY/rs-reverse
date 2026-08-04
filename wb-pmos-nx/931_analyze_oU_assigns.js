/**
 * 931_analyze_oU_assigns.js
 * 系统分析 _\$oU 在 IIFE 中的所有赋值点
 * 关键：找到浏览器中 _\$oU 变成 196 表的赋值 opcode
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

console.log('=== _\$oU 所有赋值点 ===');
let idx = 0, count = 0;
while ((idx = body.indexOf('_\$oU=', idx)) >= 0) {
  const ctx = body.substring(idx - 40, idx + 60).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 100));
  idx += 4;
  count++;
}
console.log('\n_\$oU= 赋值总数:', count);

// 找 _\$oU 被赋值为 196 表的（可能 = _\$nO 或类似）
console.log('\n=== _\$oU 赋值为数组（196）的候选 ===');
// 搜索 _\$oU=_$nO / _\$oU=_$f$ / _\$oU=_$oP 等
['_$oU=_$nO', '_$oU=_$f$', '_$oU=_$oP', '_$oU=_$lC', '_$oU=_$ll', '_$oU=_$b1', '_$oU=_$lc'].forEach(p => {
  const i = body.indexOf(p);
  console.log(p + ': @' + i + (i >= 0 ? ' ctx=' + body.substring(i - 20, i + 40).replace(/\n/g, ' ') : ''));
});

// 找 _\$oU 在 opcode 中的赋值（_$jc 分发的 opcode）
console.log('\n=== _\$oU= 附近的 opcode ===');
idx = 0;
count = 0;
while ((idx = body.indexOf('_\$oU=', idx)) >= 0) {
  // 找前面的 _$jc===N 或 _$pW===N
  const before = body.substring(Math.max(0, idx - 200), idx);
  const jcMatch = before.match(/_\\\$jc===(\d+)/g);
  const pWMatch = before.match(/_\\\$pW===(\d+)/g);
  const op = jcMatch ? jcMatch[jcMatch.length - 1] : (pWMatch ? pWMatch[pWMatch.length - 1] : '?');
  console.log('@' + idx + ' opcode=' + op + ' ctx=' + body.substring(idx - 30, idx + 50).replace(/\n/g, ' ').substring(0, 80));
  idx += 4;
  count++;
  if (count > 20) break;
}