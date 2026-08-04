/**
 * 728_B_anchors.js
 * 分析 base 中的固定锚点与尾部变体
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;

// 找每个样本中 139,176,0,0 锚点位置
console.log('=== 139,176,0,0 锚点位置 ===');
for (const s of pairs) {
  const b = s.base;
  for (let i = 0; i < b.length - 3; i++) {
    if (b[i] === 139 && b[i + 1] === 176 && b[i + 2] === 0 && b[i + 3] === 0) {
      console.log(`nsd=${s.nsd} len=${b.length}: 锚点@${i}`);
    }
  }
}

// 尾部变体组 A/B 与 base 长度
console.log('\n=== 尾部变体 vs base 长度 ===');
for (const s of pairs) {
  const tail0 = s.base[s.base.length - 12];
  const grp = tail0 === 26 ? 'A' : (tail0 === 0 ? 'B' : '?');
  console.log(`nsd=${s.nsd} len=${s.base.length} tailStart=${tail0} grp=${grp}`);
}

// 检查尾部是否与 b86 数组区长度相关（huffman 边界）
console.log('\n=== 尾部变体 vs b86 数组区长度 ===');
for (const s of pairs) {
  const arrLen = (s.b86[0] << 8) | s.b86[1];
  const tail0 = s.base[s.base.length - 12];
  console.log(`nsd=${s.nsd} len=${s.base.length} arrLen=${arrLen} tail0=${tail0}`);
}
