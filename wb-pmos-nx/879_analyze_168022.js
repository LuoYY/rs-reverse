/**
 * 879_analyze_168022.js
 * 分析 @168022 的主分发循环（IIFE 顶层，非函数内）
 * 关键：这是 IIFE 顶层的 VM 主循环（_$lP[0]）
 * 但它不是函数，是 IIFE 顶层的执行代码
 * _\$lP[0] = aebi[0]（648 长）
 * 主循环 _\$jc=_$ib[_$oL++] 读 aebi[0]
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// @168022 是 IIFE 顶层主循环（不是函数）
// _\$lP = aebi（IIFE 参数）
// _\$lP[0] = aebi[0]（648 主程序）
// 主循环 _\$jc=_$ib[_$oL++] 读 aebi[0]
// 但错误 204/227 在 aebi[1]（2553）
// 说明主循环不只读 aebi[0]
// 可能 _\$lP[0] 是 aebi[0]，但 _\$c4 等用 aebi[1]

console.log('=== 主循环分析 ===');
console.log('_\$lP[0] = aebi[0]（648 主程序）');
console.log('主循环 _\$jc=_$ib[_$oL++] 读 aebi[0]');
console.log('但 opcode 204/227 在 aebi[1]');
console.log('两个循环：IIFE 顶层主循环（aebi[0]）+ _\$c4（aebi[1]?）');
console.log();

// 检查 aebi[0] 中的 opcode 分布
console.log('=== aebi[0] opcode 分布 ===');
const p0 = inputs.aebi[0];
const ops = new Set(p0);
console.log('aebi[0] 唯一值:', [...ops].sort((a, b) => a - b).slice(0, 30).join(','));
console.log('aebi[0] 值域:', Math.min(...p0), '-', Math.max(...p0));

// 检查 aebi[1] 值域
console.log('\n=== aebi[1] 值域 ===');
const p1 = inputs.aebi[1];
console.log('aebi[1] 值域:', Math.min(...p1), '-', Math.max(...p1));

// 主循环的 _\$jc 是 opcode（<444）
// aebi[0] 的值多数 >444？检查
console.log('\n=== aebi[0] 中 <444 的值 ===');
const small = p0.filter(v => v < 444);
console.log('aebi[0] 中 <444 的值数:', small.length, '/', p0.length);
console.log('aebi[0] 中 <444 的值:', small.slice(0, 30).join(','));

// aebi[1] 中 <444 的值
console.log('\n=== aebi[1] 中 <444 的值 ===');
const small1 = p1.filter(v => v < 444);
console.log('aebi[1] 中 <444 的值数:', small1.length, '/', p1.length);
console.log('aebi[1] 中 <444 的值:', small1.slice(0, 30).join(','));