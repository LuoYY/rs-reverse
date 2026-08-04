/**
 * 873_analyze_main_call.js
 * 分析 IIFE 顶层如何启动 VM（_$c1(0) 调用）
 * 关键：IIFE 顶层有 _$c1(0) 和 _$c1(5)（opcode 282/284）
 * _$c1 用 _\$lP[4]（aebi[4]）作为程序流
 * 但 VM 主分发是哪个？_$c1 是 VM 启动器
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 找 IIFE 顶层调用（_$c1(0) 等）
console.log('=== IIFE 顶层 VM 启动 ===');
// _$c1(0) 在 opcode 282
// 找 _$c1( 调用
let idx = 0;
while ((idx = body.indexOf('_\$c1(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 60).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 50));
  idx += 4;
}

// 找 IIFE 顶层实际执行（非函数定义）
console.log('\n=== IIFE 顶层执行代码 ===');
// IIFE 顶层是 var 定义 + 函数定义 + 最终调用
// 找最后的调用（(globalThis.$_ts... 前面的）
// 找 IIFE 顶层最后的执行语句
console.log('IIFE 结尾调用:', body.substring(body.length - 200));

// 检查 _\$c1 的调用（opcode 282/284 在 _\$c1 内）
console.log('\n=== _\$c1 调用链 ===');
// _\$c1 是 opcode 282/284 调用的
// 但 IIFE 顶层怎么触发 _\$c1？
// VM 三层：_\$c1 → _\$jx → ... → _\$c4
// 但 IIFE 顶层直接调用什么？
// 找 IIFE 顶层的顶层调用（_$oQ 或 _\$c1）
console.log('IIFE 顶层 _\$c1 调用:', body.match(/_\\\$c1\\(0\\)/g));
console.log('IIFE 顶层 _\$c1(5):', body.match(/_\\\$c1\\(5\\)/g));