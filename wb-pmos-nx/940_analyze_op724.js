/**
 * 940_analyze_op724.js
 * 找 opcode 724/1285 的处理代码（可能初始化 _\$kB）
 * 关键：aebi[1] opcode 724 @11 在 725 @12 前
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const c4Idx = body.indexOf('function _$c4');
const c4 = body.substring(c4Idx, c4Idx + 300000);

// 找 opcode 724 分支（_$pW===724）
console.log('=== opcode 724 分支 ===');
const op724 = c4.indexOf('_$pW===724');
console.log('opcode 724 @', op724 >= 0 ? c4Idx + op724 : -1);
if (op724 >= 0) {
  console.log('上下文:', c4.substring(op724 - 200, op724 + 200).replace(/\n/g, ' '));
}

// 找 opcode 725 分支（_$oU=_$kB[0]）
console.log('\n=== opcode 725 分支 ===');
const op725 = c4.indexOf('_$pW===725');
console.log('opcode 725 @', op725 >= 0 ? c4Idx + op725 : -1);
if (op725 >= 0) {
  console.log('上下文:', c4.substring(op725 - 100, op725 + 100).replace(/\n/g, ' '));
}

// 找 opcode 724 附近（可能 723/724 连续）
console.log('\n=== opcode 723-726 ===');
[723, 724, 725, 726].forEach(op => {
  const i = c4.indexOf('_$pW===' + op);
  if (i >= 0) console.log('op' + op + ' @' + (c4Idx + i) + ': ' + c4.substring(i, i + 100).replace(/\n/g, ' ').substring(0, 100));
});

// 找 _\$kB 在 opcode 724 前的赋值
console.log('\n=== opcode 725 前 _\$kB 赋值 ===');
// _\$c4 内 _\$kB= 的赋值（前 20 个）
let idx = 0, count = 0;
while ((idx = c4.indexOf('_\$kB=', idx)) >= 0 && count < 20) {
  console.log('@' + (c4Idx + idx) + ': ' + c4.substring(idx - 30, idx + 50).replace(/\n/g, ' ').substring(0, 80));
  idx += 4;
  count++;
}