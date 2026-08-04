/**
 * 847_analyze_a2_scope.js
 * 深入分析 _\$a2 在 IIFE 中的作用域
 * 关键：错误在 line 11（IIFE 注入的 var 行），但 _\$a2 仍 undefined
 * 说明 var _$a2 = globalThis 被执行了，但后续被覆盖
 * 或：opcode 204 已执行（_$a2=window 但 window undefined）
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 1. 检查 opcode 204 分支（_$a2=window）在整个 IIFE 的位置
// 以及它是否在 opcode 227 之前
// 找 _\$a2=window
const a2win = body.indexOf('_\$a2=window');
console.log('_\$a2=window @', a2win);
// 找 _\$a2[ 读取（opcode 227 等）
const a2read = body.indexOf('_\$a2[');
console.log('_\$a2[ 读取 @', a2read);

// 2. 检查 opcode 204 所在的条件（_$jc===204）
// 在 _\$a2=window 前找 _$jc===204
const jc204 = body.lastIndexOf('_$jc===204', a2win);
console.log('_$jc===204 @', jc204);
console.log('上下文:', body.substring(jc204 - 30, jc204 + 80).replace(/\n/g, ' '));

// 3. 检查 window 在 Node 中的值
console.log('\n=== window 在 Node 中的值 ===');
console.log('typeof window:', typeof window);
console.log('window === globalThis:', typeof window !== 'undefined' && window === globalThis);

// 4. 关键：opcode 204 执行时 _\$a2=window
// 如果 window 是 undefined（Node 无全局 window），_\$a2 变 undefined
// 但我们设了 globalThis.window = globalThis
// 但非严格模式 IIFE 内 window 引用全局变量
// 全局变量 window 需要 var window 或 globalThis.window 属性
// 非严格模式属性可直接引用
// 但 IIFE 是 eval 执行，作用域是 eval 全局
// eval 的全局 = 运行时的全局（Node）
// would read globalThis.window
// 我们设了 globalThis.window = globalThis
// 应该有效
// 但错误在 line 11（var 注入行）？
// 不，错误是 line 11:255647
// 255647 是 IIFE 内偏移（不是 var 行）
// line 11 是 eval 的代码行（IIFE 压缩成一行）
// 所以错误在 IIFE 内 @255647（opcode 227）
// 但 _\$a2 在 opcode 204 后应为 window
// 如果 opcode 204 在 227 前执行
// 但错误说 _\$a2 undefined
// 说明 opcode 204 未执行（_$a2 还是 var 注入的 globalThis）
// 但 var 注入的 _\$a2 = globalThis（对象）
// 227 读 _\$a2[88] = globalThis['document'] 应该存在
// 但错误 undefined
// 矛盾！
// 除非：opcode 204 已执行（_$a2=window），window 是 undefined
// 检查 window 引用
console.log('\n=== 检查执行器里 window 设置 ===');
const run = fs.readFileSync('/tmp/nx_vm_executor_injected.js', 'utf8');
console.log('globalThis.window = globalThis:', run.includes('globalThis.window = globalThis'));
console.log('globalThis.window = globalThis 位置:', run.indexOf('globalThis.window = globalThis'));

// 5. 检查 IIFE 内 window 引用（可能被遮蔽）
console.log('\n=== IIFE 内 window 引用 ===');
const winRefs = (body.match(/window/g) || []).length;
console.log('window 引用数:', winRefs);
// 找 window 引用上下文
let idx = 0;
while ((idx = body.indexOf('window', idx)) >= 0 && idx < 300000) {
  console.log('@' + idx + ': ' + body.substring(idx - 20, idx + 20).replace(/\n/g, ' '));
  idx += 6;
  if (idx > 100000) break;
}