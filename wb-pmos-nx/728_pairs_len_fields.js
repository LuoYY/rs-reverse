/**
 * 728_pairs_len_fields.js
 * 分析长度字段 [48],[50],[88],[90] 与 base 长度的关系
 * 以及 base[68:] 与 base 长度的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base 长度 vs 长度字段 ===');
for (const s of samples) {
  const b = s.base;
  console.log(`nsd=${s.nsd}: len=${b.length} [48]=${b[48]} [50]=${b[50]} [88]=${b[88]} [90]=${b[90]} [68:]=${b.length - 68}`);
}

// 检查 [88] 是否 = base[68:] 长度（或长度的某种编码）
console.log('\n=== [88][90] vs 段长度 ===');
for (const s of samples) {
  const b = s.base;
  const tail = b.length - 68;
  console.log(`nsd=${s.nsd}: [88]=${b[88]} [90]=${b[90]} tail=${tail} [88]+[90]=${b[88] + b[90]} base-88=${b.length - 88}`);
}

// 检查 base 中是否有一个"长度前缀"模式
// base[68:] 长度 97-103，会不会 [88]=base[68:] 长度相关的编码？
// 或 [88] = huffman 编码某个长度？

// 检查 base[68:] 是否本身 = 明文basearr(138B) 的编码（截断）
// base[68:] 长度 97-103 vs 明文basearr 138 → 不对

// 观察 base[68] 固定段值 [189]
console.log('\n=== base[68:80] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: [68:80]=${s.base.slice(68, 80).join(',')}`);
}
