/**
 * 863_vm_trace_flow.js
 * 追踪 opcode 10/725 的执行流，确认 _\$kB 实际值
 * 关键：opcode 10 (_$kB=_$pL[0]) 和 opcode 725 (_$oU=_$kB[0]) 在 _$gq 函数
 * _$gq 用 _\$lP[1]（aebi[1]）作为程序流
 * 但 opcode 10/725 是 _\$pW 值（_$gq 内分发）
 * aebi[1] 中找 10 和 725
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// aebi[1] 是 _$gq 的程序流
const p1 = inputs.aebi[1];
console.log('aebi[1] 中 opcode 10 位置:', p1.map((v, i) => v === 10 ? i : -1).filter(i => i >= 0).slice(0, 10));
console.log('aebi[1] 中 opcode 725 位置:', p1.map((v, i) => v === 725 ? i : -1).filter(i => i >= 0).slice(0, 10));
console.log('aebi[1] 中 opcode 204 位置:', p1.map((v, i) => v === 204 ? i : -1).filter(i => i >= 0).slice(0, 10));
console.log('aebi[1] 中 opcode 227 位置:', p1.map((v, i) => v === 227 ? i : -1).filter(i => i >= 0).slice(0, 10));

// 但 opcode 10/725 在 _$gq 内（_$pW 分发）
// aebi[1] 的程序流是 _$pW
// 检查顺序：10 在 725 前？204 在 227 前？
console.log('\n=== 执行顺序 ===');
const pos10 = p1.indexOf(10);
const pos725 = p1.indexOf(725);
const pos204 = p1.indexOf(204);
const pos227 = p1.indexOf(227);
console.log('opcode 10 @', pos10, 'opcode 725 @', pos725, '10在725前:', pos10 < pos725);
console.log('opcode 204 @', pos204, 'opcode 227 @', pos227, '204在227前:', pos204 < pos227);

// 但 204/227 不在 aebi[1]（204=? 227=?）
// 204/227 是 _\$c4 的 opcode（_$jc 分发）
// 而 10/725 是 _$gq 的 opcode（_$pW 分发）
// 两个不同的解释器！
// aebi[1] 是 _$gq 的程序（_$pW 流）
// _\$c4 的程序是 aebi[0]（_$jc 流）？
// 检查 aebi[0] 中 204/227
console.log('\n=== aebi[0]（_$c4 程序?） ===');
const p0 = inputs.aebi[0];
console.log('aebi[0] 中 204:', p0.map((v, i) => v === 204 ? i : -1).filter(i => i >= 0).slice(0, 5));
console.log('aebi[0] 中 227:', p0.map((v, i) => v === 227 ? i : -1).filter(i => i >= 0).slice(0, 5));
console.log('aebi[0] 中 10:', p0.map((v, i) => v === 10 ? i : -1).filter(i => i >= 0).slice(0, 5));
console.log('aebi[0] 中 725:', p0.map((v, i) => v === 725 ? i : -1).filter(i => i >= 0).slice(0, 5));

// 关键：204/227 在哪个 aebi 数组？
console.log('\n=== 找 204/227 所在数组 ===');
inputs.aebi.forEach((a, i) => {
  const has204 = a.includes(204);
  const has227 = a.includes(227);
  if (has204 || has227) console.log('aebi[' + i + ']: 204=' + has204 + ' 227=' + has227);
});