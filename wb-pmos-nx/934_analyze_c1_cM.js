/**
 * 934_analyze_c1_cM.js
 * 分析 _\$c1（VM 启动器）和 _\$cM（配置对象）来源
 * 关键：_\$cM 含 _\$nZ 方法（解码 177 字符串），opcode 1 用它构建 _\$kB
 * _\$cM 从 IIFE 顶层传入 _\$c1
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 1. 找 _\$c1 定义
console.log('=== _\$c1 定义 ===');
const c1Idx = body.indexOf('function _$c1');
console.log('_\$c1 @', c1Idx);
if (c1Idx >= 0) {
  let depth = 0, end = c1Idx;
  for (let i = c1Idx; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  console.log('_\$c1 范围: [' + c1Idx + '-' + end + '] size=' + (end - c1Idx));
  console.log('_\$c1 参数:', body.substring(c1Idx, c1Idx + 100));
  // 找 _\$cM 在 _\$c1 内的使用
  const c1Body = body.substring(c1Idx, end);
  const cMRefs = c1Body.match(/_\\\$cM/g);
  console.log('_\$c1 内 _\$cM 引用数:', cMRefs ? cMRefs.length : 0);
}

// 2. 找 _\$c1 调用（IIFE 顶层）
console.log('\n=== _\$c1 调用 ===');
let idx = 0;
while ((idx = body.indexOf('_\$c1(', idx)) >= 0) {
  const ctx = body.substring(idx, idx + 60).replace(/\n/g, ' ');
  console.log('@' + idx + ': ' + ctx.substring(0, 50));
  idx += 4;
}

// 3. 找 _\$cM 的定义（含 _\$nZ）
console.log('\n=== _\$cM 定义（含 _\$nZ） ===');
// _\$cM={..._\$nZ...} 或类似
const cMObj = body.indexOf('_$nZ:');
console.log('_$nZ: @', cMObj);
if (cMObj >= 0) {
  // 找对象定义
  console.log('ctx:', body.substring(cMObj - 200, cMObj + 100).replace(/\n/g, ' '));
}

// 4. 找 _\$oX（解码器）
console.log('\n=== _\$oX 解码器 ===');
const oXIdx = body.indexOf('function _$oX');
console.log('_\$oX @', oXIdx);
if (oXIdx >= 0) {
  let depth = 0, end = oXIdx;
  for (let i = oXIdx; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  console.log('_\$oX 范围: [' + oXIdx + '-' + end + '] size=' + (end - oXIdx));
  console.log('源码:', body.substring(oXIdx, oXIdx + 400));
}