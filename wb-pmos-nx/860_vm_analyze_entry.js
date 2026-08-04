/**
 * 860_vm_analyze_entry.js
 * 分析 VM 入口调用（IIFE 执行时如何启动 VM）
 * 关键：IIFE 顶层在 @299745 调用 _\$oQ（VM 初始化）
 * 找到 VM 启动的实际参数
 */
const fs = require('fs');
const vm = require('vm');

// 读取原始 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 检查 IIFE 顶层（非函数）的 VM 启动代码
// 找 _\$oQ 调用（VM 初始化）
console.log('=== _\$oQ 调用 ===');
let idx = 0;
while ((idx = body.indexOf('_\$oQ(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 100).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 80));
  idx += 4;
}

// 检查 IIFE 顶层代码（最后 5000 字符）
console.log('\n=== IIFE 顶层结尾 ===');
console.log(body.substring(body.length - 3000));

// 检查 _\$c4 的入口（trampoline 如何调用）
console.log('\n=== _\$c4 定义开头 ===');
const c4Idx = body.indexOf('function _$c4');
console.log(body.substring(c4Idx, c4Idx + 200));