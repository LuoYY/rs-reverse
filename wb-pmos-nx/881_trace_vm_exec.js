/**
 * 881_trace_vm_exec.js
 * 在 vm 中追踪 VM 执行，找到 _\$kB 在哪被错误赋值
 * 关键：opcode 725 处 _\$oU=_$kB[0]，_$kB undefined
 * 捕获 _\$kB 的赋值序列
 */
const fs = require('fs');
const vm = require('vm');

// 读取注入版 IIFE
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 注入 _\$kB 赋值追踪
// 在 _\$kB= 赋值后注入日志
const kbAssigns = [];
let idx = 0;
while ((idx = body.indexOf('_\$kB=', idx)) >= 0) {
  kbAssigns.push(idx);
  idx += 4;
}
console.log('_\$kB= 赋值数:', kbAssigns.length);

// 找 opcode 725 前最近的 _\$kB= 赋值
const op725 = body.indexOf('_\$oU=_$kB[0]');
console.log('opcode 725 @', op725);
const before725 = kbAssigns.filter(p => p < op725);
console.log('725 前 _\$kB= 赋值:', before725.map(p => '@' + p).join(', '));

// 检查这些赋值的上下文
before725.slice(-5).forEach(p => {
  console.log('@' + p + ': ' + body.substring(p - 20, p + 40).replace(/\n/g, ' '));
});

// 关键：_\$kB 在 IIFE 顶层声明（var），初始 undefined
// opcode 725 前如果没有赋值，则 undefined
// 但浏览器中 opcode 725 前 _\$kB 已赋值
// 检查 IIFE 顶层 _\$kB 是否有初始赋值
console.log('\n=== IIFE 顶层 _\$kB 初始 ===');
console.log('var _\$kB:', body.includes('var _\$kB'));
const varKb = body.indexOf('var _\$kB');
console.log('var _\$kB @', varKb);
if (varKb >= 0) console.log('上下文:', body.substring(varKb - 20, varKb + 40));