/**
 * 883_analyze_725_context.js
 * 分析 opcode 725 的完整上下文
 * 关键：opcode 725 在 aebi[1] 位置 12，但 _\$gq 的 _\$pW 流不是 aebi[1]
 * 错误 @255647 是 _\$c4 主循环（_$jc 流），不是 _\$gq（_$pW 流）
 * 需重新理解 opcode 725 的归属
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 错误 @255647 是 IIFE 顶层主循环（_$jc 流）
// 但 opcode 725 在 @345686（_$gq 内）
// 错误 reading 88 是 _\$oU[88]（opcode 227）
// 所以 opcode 227 在 IIFE 顶层主循环（_$jc 流）
// opcode 725 在 _$gq（_$pW 流）
// 两个不同的解释器！

// 检查 IIFE 顶层主循环（_$jc 流）的 opcode 227
console.log('=== IIFE 顶层主循环 opcode 227 ===');
// 主循环 @168022，opcode 227 在 @255647
// 找 opcode 227 分支
const mainLoop = body.substring(168022, 296324);
const op227 = mainLoop.indexOf('_$jc===227');
console.log('opcode 227 分支 @', 168022 + op227);
if (op227 >= 0) {
  console.log(mainLoop.substring(op227 - 100, op227 + 200));
}

// 检查 opcode 204 分支
const op204 = mainLoop.indexOf('_$jc===204');
console.log('\nopcode 204 分支 @', 168022 + op204);
if (op204 >= 0) {
  console.log(mainLoop.substring(op204 - 100, op204 + 200));
}

// 检查主循环的 _\$jc 流来源
console.log('\n=== 主循环 _\$jc 流来源 ===');
const ib = mainLoop.indexOf('_$ib=_$lP[0]');
console.log('_$ib=_$lP[0] @', ib >= 0 ? 168022 + ib : -1);
const ib2 = mainLoop.indexOf('_$ib=_$lP[1]');
console.log('_$ib=_$lP[1] @', ib2 >= 0 ? 168022 + ib2 : -1);