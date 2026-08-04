/**
 * 898_find_ou_override.js
 * 找到 _\$oU 在 IIFE 中被覆盖为 undefined 的位置
 * 关键：opcode227 前 _$oU undefined，但 IIFE 注入 var _$oU = globalThis._$oU
 * 说明 IIFE 内某处把 _$oU 覆盖为 undefined
 * 找所有 _\$oU= 赋值
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 找所有 _\$oU= 赋值
console.log('=== 所有 _\$oU= 赋值 ===');
let idx = 0;
let count = 0;
while ((idx = body.indexOf('_\$oU=', idx)) >= 0) {
  const ctx = body.substring(idx - 30, idx + 50).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 80));
  idx += 4;
  count++;
  if (count > 30) break;
}
console.log('_\$oU= 赋值总数:', count);

// 找 opcode227 前的 _\$oU= 赋值（在 IIFE 顶层主循环的 opcode 分发中）
// opcode 227 @256022（注入后）
// 找 opcode 227 前最近的 _\$oU= 赋值
console.log('\n=== opcode 227 前最近的 _\$oU= 赋值 ===');
const before = body.substring(0, 256022);
let lastIdx = -1;
let i = 0;
while ((i = before.indexOf('_\$oU=', i)) >= 0) {
  lastIdx = i;
  i += 4;
}
if (lastIdx >= 0) {
  console.log('@' + lastIdx + ': ' + before.substring(lastIdx - 40, lastIdx + 60).replace(/\n/g, ' '));
} else {
  console.log('无 _\$oU= 赋值（IIFE 顶层可能没有）');
}

// 检查 IIFE 顶层（非 _\$c4）是否有 _\$oU= 赋值
console.log('\n=== IIFE 顶层 _\$oU= 赋值 ===');
const top = body.substring(0, 266824);
let j = 0;
let topCount = 0;
while ((j = top.indexOf('_\$oU=', j)) >= 0) {
  const ctx = top.substring(j - 30, j + 50).replace(/\n/g, ' ');
  console.log('@' + j + ': ' + ctx.substring(0, 80));
  j += 4;
  topCount++;
  if (topCount > 15) break;
}
console.log('IIFE 顶层 _\$oU= 赋值数:', topCount);