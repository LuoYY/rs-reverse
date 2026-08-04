/**
 * 935_analyze_gq_cM.js
 * 分析 _\$gq 的参数和 _\$cM 传入链路
 * 关键：opcode 1 在 _\$gq（@296143），_\$cM 是它的变量
 * _\$cM 由 opcode 736（_\$cM=_$$_[_$gH]）赋值，_\$$_ 来自 _\$pL
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 1. 找 _\$gq 函数（opcode 1 所在 @296143）
const gqIdx = body.lastIndexOf('function', 296143);
console.log('_\$gq（opcode1 所在函数）@', gqIdx);
let depth = 0, end = gqIdx;
for (let i = gqIdx; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
console.log('_\$gq 范围: [' + gqIdx + '-' + end + '] size=' + (end - gqIdx));
console.log('_\$gq 参数:', body.substring(gqIdx, gqIdx + 120));

// 2. 找 _\$gq 调用（_\$c1 或 IIFE 顶层）
console.log('\n=== _\$gq 调用 ===');
let idx = 0;
while ((idx = body.indexOf('_\$gq(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 60).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 50));
  idx += 4;
  if (idx > 490000) break;
}

// 3. 找 _\$cM 在 _\$gq 内的赋值（opcode 736 附近）
console.log('\n=== _\$gq 内 _\$cM 赋值 ===');
const gqBody = body.substring(gqIdx, end);
idx = 0;
while ((idx = gqBody.indexOf('_\$cM=', idx)) >= 0) {
  console.log('@' + (gqIdx + idx) + ': ' + gqBody.substring(idx - 30, idx + 50).replace(/\n/g, ' '));
  idx += 4;
  if (idx > 20000) break;
}

// 4. 找 _\$gq 的 _\$cM 初始（参数或 var）
console.log('\n=== _\$gq 参数和 var ===');
console.log('_\$gq 参数（前 200）:', body.substring(gqIdx, gqIdx + 200));

// 5. 找 opcode 1 的完整上下文
console.log('\n=== opcode 1 完整 ===');
const op1 = gqBody.indexOf('_$pW===1');
console.log('opcode 1 @', gqIdx + op1);
console.log(gqBody.substring(op1 - 100, op1 + 150));