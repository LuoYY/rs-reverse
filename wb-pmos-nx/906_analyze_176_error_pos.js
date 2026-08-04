/**
 * 906_analyze_176_error_pos.js
 * 精确分析 reading '176' 错误的表达式
 * 关键：错误在 @258171，但注入出错（语法位置）
 * 用更精确的方式：直接看错误位置 @258171 的表达式
 * 但错误在运行时的 minified 代码，位置可能偏移
 * 用 vm 的 stack 定位
 */
const fs = require('fs');

// 错误位置 @258171（fixed3）
const body = fs.readFileSync('/tmp/nx_vm_body_fixed3.js', 'utf8');

// 检查 @258171 前 200 字符
console.log('=== @258171 前 200 ===');
console.log(body.substring(258171 - 200, 258171 + 50));
console.log();

// 找该位置的 [176] 或类似
// 错误 reading '176' 说明 X[176] 且 X undefined
// 在 @258171 附近找 X[176]
const seg = body.substring(258171 - 300, 258171 + 100);
console.log('=== 段（300 前 + 100 后） ===');
console.log(seg);
console.log();

// 找所有 [176] 在段内
let idx = seg.indexOf('[176]');
while (idx >= 0) {
  console.log('[176] @', 258171 - 300 + idx, '上下文:', seg.substring(idx - 30, idx + 10));
  idx = seg.indexOf('[176]', idx + 5);
}