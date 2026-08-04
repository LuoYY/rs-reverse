/**
 * 882_check_opcode_order.js
 * 检查 opcode 执行顺序（_$gq 的 _\$pW 流）
 * 关键：opcode 725 在 aebi[1] 位置 12，opcode 10 在位置 572
 * 但 opcode 725 是 _\$gq 的 opcode（_\$pW 流）
 * _\$gq 用 _\$lP[1]（aebi[1]）
 * 所以 opcode 725 先执行（位置 12），此时 _\$kB undefined
 * 但浏览器中不报错？
 * 因为浏览器中 opcode 725 时 _\$kB 已有值（其他 opcode 前置）
 * 或者 _\$gq 不是用 aebi[1]
 * 检查 _\$gq 的 _\$pW 流来源
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 找 _\$gq 函数（含 opcode 725 的）
// opcode 725 @345686，所在函数 @295854？
// 但 @295854 是 _$gq（470B）不含 opcode 725
// opcode 725 在 @345686，向前找函数
const fnStart = body.lastIndexOf('function', 345686);
console.log('opcode 725 所在函数 @', fnStart);
console.log(body.substring(fnStart, fnStart + 100));
let depth = 0, end = fnStart;
for (let i = fnStart; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
console.log('函数范围: [' + fnStart + '-' + end + '] size=' + (end - fnStart));
const fnBody = body.substring(fnStart, end);

// 检查该函数的 _\$pW 流来源
console.log('\n=== _\$pW 流来源 ===');
const m = fnBody.match(/\$lP\[(\d+)\]/g);
console.log('_\$lP 引用:', m ? m.join(', ') : '无');
const m2 = fnBody.match(/\$pW=[^;]+/g);
console.log('_\$pW 赋值:', m2 ? m2.slice(0, 3).join(' ; ') : '无');

// 检查该函数是否用 _\$lP[1]
console.log('\n=== 主循环 _\$pW= 读哪个数组 ===');
const pW = fnBody.indexOf('_$pW=_$lP[1]');
console.log('_$pW=_$lP[1] @', pW);
if (pW >= 0) console.log('上下文:', fnBody.substring(pW - 20, pW + 40));

// 检查 aebi[1] 中 opcode 725 的位置
console.log('\n=== aebi[1] opcode 725 ===');
const p1 = inputs.aebi[1];
console.log('aebi[1] 中 725 位置:', p1.map((v, i) => v === 725 ? i : -1).filter(i => i >= 0).slice(0, 5));
console.log('aebi[1] 中 10 位置:', p1.map((v, i) => v === 10 ? i : -1).filter(i => i >= 0).slice(0, 5));

// 检查执行顺序：725 在 10 前？
// 但 opcode 725 是 _\$pW 值，不是数组索引
// 725 在 aebi[1] 位置 12 = 先执行
// 10 在位置 572 = 后执行
// 所以 725 先执行（_\$kB undefined）
// 但浏览器中不报错？
// 说明浏览器中 _\$kB 在 725 前已赋值（其他路径）
// 或 opcode 725 不是 _\$oU=_$kB[0]（不同语义）
console.log('\n=== 关键 ===');
console.log('opcode 725 在位置 12（先执行），opcode 10 在位置 572（后执行）');
console.log('725 执行时 _\$kB undefined');
console.log('但浏览器中不报错 → _\$kB 由其他路径初始化');
console.log('或 opcode 725 的 _\$kB[0] 是 undefined 但 _\$oU 赋值 undefined 不报错');
console.log('后续 _\$oU[88] 才报错（_\$oU undefined）');
console.log('浏览器中 opcode 725 后 _\$oU 有值（_\$kB[0] 有值）');
console.log('所以浏览器中 _\$kB 在 725 前已初始化');
console.log('_\$kB 初始化 opcode 10（位置 572）在 725 后 → 不是它');
console.log('那 _\$kB 由谁初始化？opcode 36（_$kB=_$ne(_$gc)）？');
console.log('或 opcode 1685（_$k0 初始化）？');
console.log('检查 all _\$kB 赋值在 725 前（@342659 等）');