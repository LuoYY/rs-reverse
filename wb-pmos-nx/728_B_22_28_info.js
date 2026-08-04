/**
 * 728_B_22_28_info.js
 * base[22:28] 是否包含 base 长度/结构信息
 * 检查与 base 长度、[68:92] 长度的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;
const NORMAL = samples.filter(s => s.base[26] === 233);

console.log('=== base[22:29] vs 长度 ===');
for (const s of NORMAL) {
  console.log(`nsd=${s.nsd}: [22:29]=${s.base.slice(22, 29).join(',')} baseLen=${s.base.length} tail68=${s.base.length - 68}`);
}

// base[22:29] 是否包含 [68:92] 长度（24）
// 或包含总长度（165）
console.log('\n=== base[22:29] vs 长度编码 ===');
for (const s of NORMAL) {
  const b = s.base;
  const len = b.length;
  // 尝试各种解释
  const v22_23 = (b[22] << 8) | b[23];
  const v24_25 = (b[24] << 8) | b[25];
  const v26_27 = (b[26] << 8) | b[27];
  console.log(`nsd=${s.nsd}: len=${len} [22:24]=${v22_23} [24:26]=${v24_25} [26:28]=${v26_27}`);
}
