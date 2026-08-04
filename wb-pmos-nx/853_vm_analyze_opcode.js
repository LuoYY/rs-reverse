/**
 * 853_vm_analyze_opcode.js
 * 分析 opcode 227 执行前 _\$a2 的值
 * 关键：错误在读 _\$a2[88]（opcode 227），说明 _\$a2 是 undefined
 * 但 vm 测试确认 window/_\$a2 可用
 * 说明：opcode 227 执行前 _\$a2 被 opcode 204 赋值 undefined？
 * 或 opcode 227 不在 _\$c4 内（在另一个函数）
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 分析 opcode 227 所在位置
// 错误 @255647（注入后）
// 检查该位置上下文
console.log('=== opcode 227 上下文 @255647 ===');
console.log(body.substring(255400, 255900));
console.log();

// 关键：opcode 227 是 _\$c4 内的分发（_$jc===227）
// 但 _\$c4 在错误时执行
// _\$c4 内 _\$a2 是闭包变量（IIFE 顶层 var _$a2）
// 注入的 var _$a2 = globalThis 在 IIFE 顶层
// 但 opcode 204 赋值 _\$a2=window（在解释器内）
// 如果 opcode 204 在 227 前执行，_\$a2 = window（sandbox）
// 227 读 _\$a2[88] = sandbox['document'] 存在
// 但错误 undefined
// 说明 opcode 204 未执行（_\$a2 还是注入的 globalThis）
// 但注入的 _\$a2 = globalThis（sandbox）
// 227 读 sandbox[88] = sandbox['document'] 存在
// 也应有值！
// 但错误 undefined
// 唯一可能：_\$a2 在 opcode 227 前被设为 undefined
// 检查：opcode 204 前是否有 _\$a2 = undefined 或类似
// 或：注入的 var _$a2 在 IIFE 内被覆盖（某函数参数）
// 检查 IIFE 顶层 _\$a2 的后续赋值
console.log('=== IIFE 顶层 _\$a2 赋值（非函数内） ===');
// 找 _\$a2= 在 IIFE 顶层（非 _\$c4 内）
// 用简单搜索：找所有 _\$a2= 看上下文
let idx = 0;
while ((idx = body.indexOf('_\$a2=', idx)) >= 0) {
  const ctx = body.substring(idx - 30, idx + 30).replace(/\n/g, ' ');
  if (ctx.includes('_$jc===') || ctx.includes('window')) {
    console.log('@' + idx + ': ' + ctx);
  }
  idx += 4;
}

// 检查：opcode 204 的 _\$a2=window 是否在 _\$c4 内
console.log('\n=== opcode 204 位置 ===');
const a2win = body.indexOf('_\$a2=window');
console.log('_\$a2=window @', a2win);
// _\$c4 从 @267104
console.log('_\$c4 从 @267104，_\$a2=window @', a2win, '在 _\$c4 内?', a2win > 267104);
// 但错误 @255647 < 267104（IIFE 顶层，非 _\$c4）
// 所以 opcode 227 错误在 IIFE 顶层（非 _$c4）
// IIFE 顶层有 opcode 分发（_$oQ 调用）
// 但 opcode 204 在 _\$c4 内（@254975 < 267104？）
// 不，@254975 < 267104，所以 opcode 204 也在 IIFE 顶层
// 但 _\$c4 从 @267104 开始（225KB）
// 所以 opcode 204/227 都在 IIFE 顶层（_$oQ 或初始 VM）
// 这不是 _\$c4！
// 是另一个解释器（IIFE 顶层的 VM 初始化）
console.log('\n=== 关键发现 ===');
console.log('opcode 204/227 在 IIFE 顶层的解释器（非 _$c4）');
console.log('该解释器从 @249287 到 @296405（47KB）');
console.log('opcode 204 赋值 _\$a2=window');
console.log('opcode 227 读 _\$a2[88]');
console.log('但 opcode 204 在 227 前（位置 254975 < 255647）');
console.log('所以 204 已执行（_$a2=window）');
console.log('但 window 是 undefined？');
console.log('检查：该解释器是否在 _\$c4 之前执行');
console.log('VM 初始化顺序：先 IIFE 顶层解释器（204/227），再 _\$c4');