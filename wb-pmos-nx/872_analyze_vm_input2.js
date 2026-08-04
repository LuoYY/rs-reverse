/**
 * 872_analyze_vm_input2.js
 * 分析 VM 输入（修复正则）
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

console.log('=== 输入 aebi ===');
inputs.aebi.forEach((a, i) => {
  console.log('aebi[' + i + ']: len=' + a.length + ' 前10=' + a.slice(0, 10).join(','));
});

console.log('\n=== scj ===');
console.log('scj:', JSON.stringify(inputs.scj).substring(0, 200));

// 找 _\$c4 的主调用（IIFE 顶层）
console.log('\n=== _\$c4 主调用 ===');
// 找 _\$c4(0 或类似
let idx = 0;
while ((idx = body.indexOf('_\$c4(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 100).replace(/\n/g, ' ');
  // 只显示含 aebi 或 _\$lP 或 0 开头的主调用
  if (ctx.includes('_\$lP') || ctx.startsWith('_\$c4(0') || ctx.includes('aebi')) {
    console.log('@' + idx + ': ' + ctx.substring(0, 80));
  }
  idx += 4;
}

// 检查 IIFE 顶层调用 VM 的代码
console.log('\n=== IIFE 顶层 _\$c4 相关 ===');
// IIFE 顶层在 @299745 附近调用
const tail = body.substring(body.length - 5000);
console.log(tail);