/**
 * 939_analyze_pW_flow.js
 * 分析 aebi[1] 程序流的 opcode 完整顺序
 * 关键：_$c4 主循环 _\$pW=_$lP[1]（aebi[1]）
 * opcode 725 @12 先于 opcode 1 @1488
 * 但浏览器中 opcode 725 时 _\$kB 是数组（非函数）
 * 需找 _\$kB 在 opcode 725 前被什么改为数组
 */
const fs = require('fs');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const p1 = inputs.aebi[1];

// 列出所有关键 opcode 的位置
const ops = [0, 1, 10, 36, 37, 44, 90, 725, 726, 736, 740];
console.log('=== aebi[1] opcode 位置 ===');
ops.forEach(op => {
  const positions = p1.map((v, i) => v === op ? i : -1).filter(i => i >= 0);
  console.log('opcode ' + op + ' @', positions.join(','), '(第一个@' + (positions[0] ?? '-') + ')');
});

// 程序流的前 30 个 opcode
console.log('\n=== aebi[1] 前 40 个值 ===');
console.log(p1.slice(0, 40).join(','));

// 关键：opcode 725 @12，但 725 是 _\$pW 分支（_$pW===725）
// _\$pW 是 opcode 流（aebi[1] 的值）
// opcode 725 执行时 _\$kB 是什么？
// _\$kB 由 opcode 1（@1488）解码，但 725 @12 在 1 前
// 所以 opcode 725 时 _\$kB 是函数（IIFE 函数声明）
// _\$kB[0] = 函数[0] = undefined
// 但浏览器中 _\$oU=arr:196
// 矛盾！
// 除非：opcode 725 的 _\$kB 不是 aebi[1] 驱动的
// 或：_\$c4 的 _\$pW 流不是 aebi[1]
// 检查 _\$c4 的 _\$pW 来源
console.log('\n=== _\$c4 的 _\$pW 来源 ===');
// _\$c4 内 _\$pW=_$lP[1]? 还是其他
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const c4Idx = body.indexOf('function _$c4');
const c4 = body.substring(c4Idx, c4Idx + 300000);
const pWAssign = c4.match(/\$pW=[^;]+;/g);
console.log('_\$pW 赋值:', pWAssign ? pWAssign.slice(0, 5).join(' ; ') : '无');
// 找 _\$pW=_$lP[1]
const pW1 = c4.indexOf('_$pW=_$lP[1]');
console.log('_\$pW=_$lP[1] @', pW1 >= 0 ? c4Idx + pW1 : -1);
// 找主循环
const pW2 = c4.indexOf('_$pW=_$lP[');
console.log('_\$pW=_$lP[ @', pW2 >= 0 ? c4Idx + pW2 : -1);
if (pW2 >= 0) console.log('ctx:', c4.substring(pW2 - 20, pW2 + 50));