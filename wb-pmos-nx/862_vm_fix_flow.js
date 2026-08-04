/**
 * 862_vm_fix_flow.js
 * 关键修复：opcode 10 在 opcode 725 前（同函数 _$gq）
 * opcode 10: _$kB=_$pL[0]（_$pL[0] 是 aebi[0]！）
 * opcode 725: _$oU=_$kB[0]（_$kB[0] = aebi[0][0]）
 * 检查 aebi[0][0] 是否有效
 * 但错误说 _\$oU undefined（_$kB[0] undefined）
 * 说明 aebi[0] 索引 0 是 undefined？或 aebi[0] 本身 undefined
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

console.log('=== aebi 结构 ===');
console.log('aebi 数组数:', inputs.aebi.length);
inputs.aebi.forEach((a, i) => {
  console.log('aebi[' + i + ']: len=' + a.length + ' 前20=' + a.slice(0, 20).join(','));
});

// 检查 opcode 725 的 _$kB[0]
// _$kB = _$pL[0] = aebi[0]（VM 程序）
// _$kB[0] = aebi[0][0]
console.log('\n=== aebi[0][0] ===');
console.log('aebi[0][0] =', inputs.aebi[0] ? inputs.aebi[0][0] : 'aebi[0] undefined');

// 但 opcode 725 是 _$oU=_$kB[0]
// 如果 aebi[0][0] 是数字，_\$oU 变数字
// 但 _\$oU[88] 需要数组
// 所以 _\$oU 应该是数组（aebi[0] 是数组？）
// 但 aebi[0] 是程序（648 长度），不是字符串表
// _\$oU 应该是字符串表（196 长度）
// 所以 opcode 725 的 _\$kB[0] 不是 aebi[0][0]
// 而是 _\$kB 是更复杂的表
console.log('\n=== 关键问题 ===');
console.log('opcode 725: _$oU=_$kB[0]');
console.log('_\$kB[0] 应为字符串表（196 长度）');
console.log('如果 _\$kB[0] 是数字（aebi[0][0]），_\$oU 变数字');
console.log('_\$oU[88] 时数字[88] = undefined → 报错 reading 88？');
console.log('不，数字[88] 是 undefined 不报错');
console.log('读取 undefined[88] 才报错');
console.log('所以 _\$oU 是 undefined（_\$kB[0] 是 undefined）');
console.log('_\$kB[0] undefined → aebi[0][0] undefined → aebi[0] 是空数组？');
console.log('检查 aebi[0] 是否为空');
console.log('aebi[0] len:', inputs.aebi[0] ? inputs.aebi[0].length : 'N/A');