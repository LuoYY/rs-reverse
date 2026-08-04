/**
 * 926_analyze_225_226.js
 * 分析 opcode 225/226 分支（_$c4(1902,...) 调用）
 * 关键：opcode 227 前有 opcode 226（_$c4(1902,_$c7,_$oU[145],_$af)）
 * opcode 226 调用 _\$c4(1902,...) 会执行嵌套 VM
 * 嵌套 VM 可能覆盖 _\$oU？
 * 但 opcode 227 前 _\$oU 无赋值（=0）
 * 且 opcode 725 在 _\$gq 内（非主循环）
 * 所以主循环 opcode 227 时 _\$oU 应 = IIFE 顶层注入的 globalThis._\$oU
 * 但 sandbox 里 _\$oU undefined
 * 说明 IIFE 顶层注入 var _$oU = globalThis._\$oU 没生效
 * 或 sandbox._\$oU 是 undefined
 * 检查：922 里 sandbox._\$oU = tables196._\$oU（196 字符串）
 * 应该生效
 * 但 IIFE 顶层注入 var _$oU = globalThis._\$oU
 * 在 vm context 里 globalThis = sandbox
 * sandbox._\$oU = tables196._\$oU
 * 应该生效
 * 但错误 _\$oU undefined
 * 关键：IIFE 顶层注入的 var 在 IIFE 参数后
 * 但 IIFE 内 opcode 204 已执行（_$a2=window）
 * opcode 204 不碰 _\$oU
 * 但 opcode 226 调用 _\$c4(1902,...) 传入 _\$oU[145]
 * _\$c4(1902) 是嵌套 VM 调用（opcode 1902）
 * 嵌套 VM 可能修改 _\$oU（闭包）
 * 检查 opcode 1902 的处理
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// opcode 226 分支（_$c4(1902,_$c7,_$oU[145],_$af)）
const op226 = body.indexOf('_$c4(1902,');
console.log('opcode 226 @', op226);
if (op226 >= 0) console.log('上下文:', body.substring(op226 - 80, op226 + 80).replace(/\n/g, ' '));

// opcode 1902 处理（_$c4 内）
const op1902 = body.indexOf('_$jc===1902');
console.log('\nopcode 1902 @', op1902);
if (op1902 >= 0) console.log('上下文:', body.substring(op1902 - 100, op1902 + 200).replace(/\n/g, ' '));
else console.log('未找到（1902 可能是 trampoline opcode）');

// 检查 opcode 226 在 aebi[0] 的位置
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const p0 = inputs.aebi[0];
console.log('\naebi[0] 中 226 @', p0.indexOf(226), '227 @', p0.indexOf(227), '226 在 227 前?', p0.indexOf(226) < p0.indexOf(227));

// 关键：opcode 226 调用 _\$c4(1902,...) 是嵌套 VM
// 嵌套 VM 执行 opcode 1902 程序
// 可能覆盖 _\$oU
// 但 aebi[0] 中 226 在 227 前（执行顺序）
// 所以嵌套 VM 先执行，可能覆盖 _\$oU
// 检查嵌套 VM 是否修改 _\$oU
console.log('\n=== 嵌套 VM 分析 ===');
console.log('opcode 226 (_$c4(1902,...)) 在 227 前执行');
console.log('嵌套 VM (1902) 可能修改 _\$oU');
console.log('但浏览器中 227 时 _\$oU=arr:196（正常）');
console.log('说明嵌套 VM 不修改 _\$oU 或修改后恢复');
console.log('Node 中嵌套 VM 可能失败（环境）→ _\$oU 未恢复');