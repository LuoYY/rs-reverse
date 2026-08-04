/**
 * 844_analyze_c4_a2.js
 * 分析 _$c4（225KB 大解释器）内 _\$a2 的赋值/读取
 * 关键：opcode 204 赋值 _\$a2=window，opcode 227 读取 _\$a2
 * 但 _\$c4 内 _\$a2 是闭包变量（IIFE 顶层 var _\$a2）
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// _$c4 从 @267104 到 @492109（225KB）
const c4 = body.substring(267104, 492109);

// 1. _\$c4 内 _\$a2 的赋值
console.log('=== _$c4 内 _\$a2 赋值 ===');
let idx = 0;
while ((idx = c4.indexOf('_\$a2=', idx)) >= 0) {
  console.log('@' + (267104 + idx) + ': ' + c4.substring(idx - 20, idx + 40).replace(/\n/g, ' '));
  idx += 4;
}

// 2. _\$c4 内 opcode 204/227 分支
console.log('\n=== _$c4 内 opcode 204/227 ===');
const op204 = c4.indexOf('_$jc===204');
const op227 = c4.indexOf('_$jc===227');
console.log('opcode 204 @', op204 >= 0 ? 267104 + op204 : -1);
console.log('opcode 227 @', op227 >= 0 ? 267104 + op227 : -1);
if (op204 >= 0) console.log('204 上下文:', c4.substring(op204 - 60, op204 + 80).replace(/\n/g, ' '));
if (op227 >= 0) console.log('227 上下文:', c4.substring(op227 - 60, op227 + 80).replace(/\n/g, ' '));

// 3. 检查 _\$c4 是否引用 _\$a2（闭包）
console.log('\n=== _$c4 内 _\$a2 引用数 ===');
const a2Count = (c4.match(/_\\\$a2/g) || []).length;
console.log('_\$a2 引用数:', a2Count);

// 4. 关键：opcode 204 是 _\$a2=window（在 _\$c4 内）
// 但错误在 opcode 227（_\$a2 未赋值）
// 说明 opcode 204 在 227 之后执行（程序序）
// 或 opcode 204 条件不满足
console.log('\n=== 结论 ===');
console.log('_\$c4 内 opcode 204 赋值 _\$a2=window');
console.log('但 opcode 227 在 204 前访问 _\$a2');
console.log('_\$a2 初始 = IIFE 注入的 globalThis._\$a2');
console.log('但错误 undefined → 注入的 _\$a2 未生效');
console.log('或 opcode 204 已执行（_$a2=window 但 window undefined）');