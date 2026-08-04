/**
 * 728_B_b86_struct.js
 * 理解 b86 完整结构（cd 的内容组成）
 * b86[0:2] 长度头 → b86[2:2+len] 数组 → 后面是 keys 段
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

for (const s of samples) {
  const b = s.b86;
  const len = (b[0] << 8) | b[1];
  console.log(`nsd=${s.nsd}: b86 len=${b.length} 头长度=${len} 数组区=${len}B [2:2+len]`);
  console.log(`  数组区前20: ${b.slice(2, 22).join(',')}`);
  // keys 段
  const ksStart = 2 + len;
  console.log(`  keys段从 ${ksStart} 开始, keys段前16: ${b.slice(ksStart, ksStart + 16).join(',')}`);
  console.log(`  keys段剩余: ${b.length - ksStart}B`);
}

// 对比 base[68:] 长度与 b86 keys段长度
console.log('\n=== base[68:] 长度 vs b86 结构 ===');
for (const s of samples) {
  const b = s.b86;
  const len = (b[0] << 8) | b[1];
  const tail68 = s.base.length - 68;
  console.log(`nsd=${s.nsd}: tail68=${tail68} b86数组区=${len} keys段=${b.length - 2 - len}`);
}
