/**
 * 856_vm_fix_ou.js
 * 修复 _\$oU 未定义问题！
 * 关键：opcode 227 前 _\$oU 是 undefined（但 _\$a2 是 object）
 * 原因：\_$oU 在 IIFE 内被 opcode 覆盖（_$oU=[...] 由 opcode 生成）
 * 捕获的 _\$oU 是签名（非真实值），VM 运行时重新生成 _\$oU
 * 但 VM 生成 _\$oU 需要 opcode 执行（依赖环境）
 * 问题：VM 用 _\$oU 前必须已生成，但 VM 生成 _\$oU 的 opcode 未执行
 * 或：VM 的 _\$oU 生成依赖 _\$k0（常量表）
 * 检查：VM 里 _\$oU 的生成 opcode
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 找 _\$oU 的赋值（VM 生成 _\$oU 的地方）
console.log('=== _\$oU 赋值位置 ===');
let idx = 0;
while ((idx = body.indexOf('_\$oU=', idx)) >= 0) {
  console.log('@' + idx + ': ' + body.substring(idx - 30, idx + 60).replace(/\n/g, ' '));
  idx += 4;
}

// 找 _\$oU 的生成（opcode 1685 等）
console.log('\n=== _\$oU 生成 opcode ===');
// 常见：_$oU=_$nP(_\$ez) 或类似
const oUgen = body.indexOf('_\$oU=_');
console.log('_\$oU=_ @', oUgen);
if (oUgen >= 0) console.log('上下文:', body.substring(oUgen - 30, oUgen + 60).replace(/\n/g, ' '));

// 检查 _\$oU 是否在 IIFE 顶层声明
console.log('\n=== _\$oU 在 IIFE 注入 ===');
console.log('注入含 var _\$oU:', body.includes('var _\$oU = globalThis._\$oU'));
console.log('注入位置:');
const v = body.indexOf('var _\$oU');
console.log('@' + v, body.substring(v, v + 40));