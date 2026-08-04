/**
 * 932_analyze_kB_assigns.js
 * 系统分析 _\$kB 的所有赋值点，确认 _\$kB[0] 是否为 196 表
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

console.log('=== _\$kB 所有赋值点 ===');
let idx = 0, count = 0;
while ((idx = body.indexOf('_\$kB=', idx)) >= 0) {
  const ctx = body.substring(idx - 50, idx + 70).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 120));
  idx += 4;
  count++;
}
console.log('\n_\$kB= 赋值总数:', count);

// 找 _\$kB 的初始声明
console.log('\n=== _\$kB 初始 ===');
const varKB = body.indexOf('var _$kB');
console.log('var _$kB @', varKB);
if (varKB >= 0) console.log('ctx:', body.substring(varKB - 20, varKB + 40));

// 找 _\$kB 由什么 opcode 赋值
console.log('\n=== _\$kB= 附近的 opcode ===');
idx = 0;
while ((idx = body.indexOf('_\$kB=', idx)) >= 0) {
  const before = body.substring(Math.max(0, idx - 300), idx);
  const jcMatch = before.match(/_\\\$jc===(\d+)/g);
  const pWMatch = before.match(/_\\\$pW===(\d+)/g);
  const op = jcMatch ? jcMatch[jcMatch.length - 1] : (pWMatch ? pWMatch[pWMatch.length - 1] : '?');
  console.log('@' + idx + ' opcode=' + op);
  idx += 4;
}

// 关键：浏览器中 _\$kB 是函数还是数组？
// 919 捕获 _\$kB=fn（函数）
// 但 opcode 725 的 _\$kB[0] 如果是函数[0] = undefined
// 浏览器中 _\$oU=arr:196 说明 _\$kB[0]=196表
// 所以浏览器中 _\$kB 是数组（[196表,...]）非函数！
// 919 捕获的 _\$kB=fn 可能是其他时刻（opcode 10: _\$pL[0]=number 1 的 [0]？）
// 但 1[0] 是 undefined 不是 fn
// 所以 _\$kB 由某个 opcode 赋值为函数，由另一个赋值为数组
// 关键：opcode 725 执行时 _\$kB 必须是 [196表,...] 数组
console.log('\n=== 关键 ===');
console.log('opcode 725 的 _\$kB[0] 必须 = 196 表');
console.log('_\$kB 应是 [196表, ...] 数组（或嵌套）');
console.log('但 919 捕获 _\$kB=fn（函数）');
console.log('需确认：浏览器中 opcode 725 时 _\$kB 是什么');
console.log('可能：opcode 725 前 _\$kB 被赋值为 _\$pL（196表数组）');
console.log('或 _\$kB 是 _\$oU 自身（循环）');