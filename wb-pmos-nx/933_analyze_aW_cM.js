/**
 * 933_analyze_aW_cM.js
 * 分析 _\$aW（字符串表解码器）和 _\$cM（配置对象）
 * 关键：opcode 1: _$kB=_$aW(_$kB,_$cM._$nZ)
 * _$aW 把 _$cM._$nZ（编码字符串）解码为数组，_\$kB[0]=196表
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');

// 1. 找 _\$aW 函数定义
console.log('=== _\$aW 函数 ===');
const aWIdx = body.indexOf('function _$aW');
console.log('_\$aW @', aWIdx);
if (aWIdx >= 0) {
  let depth = 0, end = aWIdx;
  for (let i = aWIdx; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  console.log('_\$aW 范围: [' + aWIdx + '-' + end + '] size=' + (end - aWIdx));
  console.log('=== 源码 ===');
  console.log(body.substring(aWIdx, end));
}

// 2. 找 _\$cM 来源
console.log('\n=== _\$cM 来源 ===');
let idx = 0;
while ((idx = body.indexOf('_\$cM', idx)) >= 0) {
  const ctx = body.substring(idx - 30, idx + 50).replace(/\n/g, ' ');
  if (ctx.includes('_\$cM=') || ctx.includes('_\$cM =')) {
    console.log('@' + idx + ': ' + ctx.substring(0, 80));
  }
  idx += 4;
}

// 3. 找 _\$cM._$nZ 的来源（可能来自 _\$pL 或 aebi）
console.log('\n=== _\$cM._\$nZ 相关 ===');
const nZIdx = body.indexOf('_$nZ');
console.log('_$nZ @', nZIdx);
if (nZIdx >= 0) {
  console.log('ctx:', body.substring(nZIdx - 50, nZIdx + 50).replace(/\n/g, ' '));
}