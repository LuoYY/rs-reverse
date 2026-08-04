/**
 * 925_analyze_227_real_func.js
 * 找出 opcode 227 真正所在的函数（用括号匹配精确）
 * 关键：opcode 227 @255658 在 IIFE 顶层主循环（非 _$c4）
 * 但 IIFE 顶层主循环是 IIFE 直接执行（非函数）
 * 所以 _\$oU 是 IIFE 顶层 var（需注入）
 * 但 IIFE 顶层 var _$oU 检查 false（IIFE 没声明）
 * 所以 _\$oU 是隐式全局（非严格）
 * 注入 var _$oU 应生效！
 * 但 sandbox 里 _\$oU 是 undefined
 * 因为 IIFE 顶层 var _$oU = globalThis._\$oU 未执行？
 * 或执行了但被覆盖
 * 检查：IIFE 顶层主循环（opcode 227 之前）是否有 _\$oU 赋值
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// opcode 227 @255658，找它之前的所有 _\$oU= 赋值
const before = body.substring(0, 255658);
console.log('=== opcode 227 前所有 _\$oU= 赋值 ===');
let idx = 0, count = 0;
while ((idx = before.indexOf('_\$oU=', idx)) >= 0) {
  console.log('@' + idx + ': ' + before.substring(idx - 30, idx + 50).replace(/\n/g, ' '));
  idx += 4;
  count++;
  if (count > 20) break;
}
console.log('_\$oU= 赋值数（227 前）:', count);

// 检查 opcode 204 分支（_$a2=window）是否在 227 前
const op204 = before.indexOf('_$a2=window');
console.log('\nopcode 204 (_$a2=window) @', op204, '在 227 前?', op204 < 255658);

// 检查 opcode 725 分支（_$oU=_$kB[0]）是否在 227 前
const op725 = before.indexOf('_$oU=_$kB[0]');
console.log('opcode 725 (_$oU=_$kB[0]) @', op725, '在 227 前?', op725 > 0 && op725 < 255658);

// 关键：opcode 227 在 IIFE 顶层主循环（非函数）
// 主循环的 _\$jc 是 opcode 流
// opcode 204/725 是 _\$jc 分发的 opcode
// 执行顺序由 aebi[0] 的 opcode 序列决定
// 检查 aebi[0] 中 204/227/725 的顺序
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));
const p0 = inputs.aebi[0];
console.log('\n=== aebi[0] opcode 顺序 ===');
console.log('204 @', p0.indexOf(204), '227 @', p0.indexOf(227), '725 @', p0.indexOf(725));
console.log('204 在 227 前:', p0.indexOf(204) < p0.indexOf(227));
console.log('725 在 227 前:', p0.indexOf(725) > 0 && p0.indexOf(725) < p0.indexOf(227));