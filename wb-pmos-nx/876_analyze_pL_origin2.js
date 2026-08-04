/**
 * 876_analyze_pL_origin2.js
 * 分析 _\$pL 真实来源（修复正则）
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 找 _\$lP[ 的使用（IIFE 顶层）
console.log('=== _\$lP[ 使用（IIFE 顶层 80000 内） ===');
let idx = 0;
while ((idx = body.indexOf('_\$lP[', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 40).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 40));
  idx += 5;
  if (idx > 80000) break;
}

// 检查 _\$c1 内 _\$c4 调用
console.log('\n=== _\$c1 内 _\$c4 调用 ===');
const c1Idx = body.indexOf('function _$c1');
if (c1Idx >= 0) {
  const c1 = body.substring(c1Idx, c1Idx + 100000);
  let i = 0;
  while ((i = c1.indexOf('_\$c4(', i)) >= 0) {
    console.log('@' + (c1Idx + i) + ': ' + c1.substring(i, i + 80).replace(/\n/g, ' ').substring(0, 60));
    i += 4;
  }
}

// 检查 _\$c4 的调用（主入口）
console.log('\n=== _\$c4 主调用（_$c4(0 或类似） ===');
// 找 _\$c4(0) 或 _\$c4(数字)
let i = 0;
while ((i = body.indexOf('_\$c4(', i)) >= 0) {
  const ctx = body.substring(i, i + 60).replace(/\n/g, ' ');
  // 只显示 IIFE 顶层（非函数内）的调用（_$c4(0) 开头）
  if (ctx.startsWith('_\$c4(0') || ctx.startsWith('_\$c4(1') || ctx.startsWith('_\$c4(2')) {
    console.log('@' + i + ': ' + ctx.substring(0, 50));
  }
  i += 4;
  if (i > 400000) break;
}