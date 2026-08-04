/**
 * 858_vm_trace_ou_v2.js
 * 追踪 _\$oU 变 undefined（修复注入语法错误）
 * 关键：注入点可能破坏代码结构，用更安全的方式
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 关键发现：opcode 725 赋值 _\$oU=_$kB[0]
// 在 opcode 227 前，VM 执行了 opcode 725（_$oU=_$kB[0]）
// _$kB[0] 是 undefined → _\$oU 变 undefined
// 所以问题是 _\$kB 表未提供！
// 检查 _\$kB 是什么（VM 表）
// _\$kB 类似 _\$k0（常量表），由 opcode 生成
// 需要捕获 _\$kB
console.log('=== 关键发现 ===');
console.log('opcode 725 赋值 _\$oU=_$kB[0]');
console.log('_\$kB[0] 是 undefined → _\$oU 变 undefined');
console.log('_\$kB 是 VM 常量表（未捕获）');
console.log('错误 reading 88 = _\$oU[88] 时 _\$oU undefined（_$kB[0] undefined）');
console.log();
// 检查 _\$kB 在 VM 中如何生成
console.log('=== _\$kB 生成 ===');
let idx = 0;
while ((idx = body.indexOf('_\$kB=', idx)) >= 0) {
  console.log('@' + idx + ': ' + body.substring(idx - 30, idx + 60).replace(/\n/g, ' '));
  idx += 4;
}
// 检查 _\$kB 是否被捕获
const tables = JSON.parse(fs.readFileSync('/tmp/nx_vm_tables_init.json', 'utf8'));
console.log('捕获的表含 _\$kB:', Object.keys(tables).includes('_$kB'));