/**
 * 884_analyze_227_flow.js
 * 分析 opcode 227 的 _\$jc 流和 _\$oU 赋值
 * 关键：主循环 _\$ib=_$lP[0]（aebi[0]，648 全 <444）
 * opcode 227 在 aebi[0] 位置 84
 * opcode 204 在 aebi[0] 位置 30
 * 所以 204 先执行（_$a2=window），227 后执行（_$a2 已赋值）
 * 但错误说 _\$a2 undefined
 * 说明 204 执行后 _\$a2=window 但 window 是 undefined！
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 主循环 _\$ib = aebi[0]（648）
// 但 opcode 204/227 在 aebi[0] 还是 aebi[1]？
const p0 = inputs.aebi[0];
const p1 = inputs.aebi[1];
console.log('aebi[0] 中 204 位置:', p0.map((v, i) => v === 204 ? i : -1).filter(i => i >= 0));
console.log('aebi[0] 中 227 位置:', p0.map((v, i) => v === 227 ? i : -1).filter(i => i >= 0));
console.log('aebi[1] 中 204 位置:', p1.map((v, i) => v === 204 ? i : -1).filter(i => i >= 0));
console.log('aebi[1] 中 227 位置:', p1.map((v, i) => v === 227 ? i : -1).filter(i => i >= 0));

// 主循环 _\$jc=_$ib[_$oL++] 读 aebi[0]
// 如果 opcode 204/227 在 aebi[0]，则主循环执行它们
// 但错误在 line 255647（opcode 227）
// 检查 aebi[0] 的 204/227 顺序
console.log('\n=== aebi[0] 执行序 ===');
const p204 = p0.indexOf(204);
const p227 = p0.indexOf(227);
console.log('aebi[0] 204 @', p204, '227 @', p227, '204在227前:', p204 < p227);

// 但错误说 _\$a2 undefined（opcode 227 时）
// 204 已执行（_$a2=window）
// 如果 window undefined → _\$a2 undefined
// 检查 vm sandbox 中 window
console.log('\n=== vm window 检查 ===');
// 在 sandbox 中 window = sandbox
console.log('sandbox.window = sandbox（851 脚本）');
console.log('opcode 204 _$a2=window → _$a2 = sandbox');
console.log('227 读 _$a2[88] = sandbox[88]');
console.log('但 sandbox[88] 是数字索引，不是 document！');
console.log('_\$a2[_\$oU[88]] = _$a2[88]（_$oU[88]="document"）');
console.log('不，_\$oU[88] = "document"（字符串）');
console.log('_\$a2["document"] = sandbox.document（存在）');
console.log('但错误 reading 88 → _\$oU[88] 时 _\$oU undefined');
console.log('不是 _\$a2 的问题！是 _\$oU undefined！');
console.log('_\$oU[88] 时 _\$oU undefined → reading 88');
console.log('opcode 725 赋值 _\$oU=_$kB[0]（_$kB undefined → _\$oU undefined）');
console.log('但 opcode 725 在 _$gq（_\$pW 流），不在主循环（_\$jc 流）');
console.log('主循环的 _\$oU 是闭包变量（IIFE 顶层）');
console.log('opcode 725 在 _$gq 内赋值 _\$oU（闭包）');
console.log('_\$gq 执行后 _\$oU = _\$kB[0]（undefined）');
console.log('主循环 opcode 227 读 _\$oU[88] = undefined[88] 报错');
console.log('根因：_\$gq 的 opcode 725 赋值 _\$oU=_$kB[0]，_$kB undefined');
console.log('_\$kB 在 _$gq 内未初始化（opcode 10 在 725 后）');
console.log('浏览器中 _\$kB 在 725 前已初始化（opcode 1685 或 _\$gc）');
console.log('需提供 _\$kB 或确保 opcode 10 先执行');