/**
 * 728_B_22_26_len.js
 * 验证 base[22:26] 是否编码了 base[68:] 长度或 base 总长度
 * base[22:26] 4B: 每样本不同
 * base[68:] 长度 = base.length - 68
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base[22:26] vs 长度 ===');
for (const s of samples) {
  const b = s.base;
  const v22 = b[22], v23 = b[23], v24 = b[24], v25 = b[25];
  console.log(`nsd=${s.nsd}: [22:26]=${v22},${v23},${v24},${v25} baseLen=${b.length} tail68=${b.length - 68}`);
  // 尝试 16 位组合
  console.log(`  v22*256+v23=${v22 * 256 + v23} v24*256+v25=${v24 * 256 + v25} v22+v23=${v22 + v23}`);
}

// base[88][90] 长度字段 vs base[68:] 长度
console.log('\n=== base[88][90] vs 长度 ===');
for (const s of samples) {
  const b = s.base;
  const v88 = b[88], v90 = b[90];
  console.log(`nsd=${s.nsd}: [88]=${v88} [90]=${v90} tail68=${b.length - 68} baseLen=${b.length}`);
}
