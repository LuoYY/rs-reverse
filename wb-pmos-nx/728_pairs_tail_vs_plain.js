/**
 * 728_pairs_tail_vs_plain.js
 * 对比 base[68:] 与明文 basearr（b86[2:140]）
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base[68:] vs b86[2:140] ===');
for (const s of samples) {
  const tail = s.base.slice(68);
  const plain = s.b86.slice(2, 140);
  const n = Math.min(tail.length, plain.length);
  let same = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) { if (tail[i] === plain[i]) same++; else diffs.push(i); }
  console.log(`nsd=${s.nsd}: tail=${tail.length} plain=${plain.length} 相同=${same}/${n}`);
  if (same > 5) console.log(`  差异前20: ${diffs.slice(0, 20).join(',')}`);
}

// base[68:] 长度 vs b86[2:] 长度
console.log('\n=== base[68:] 长度 vs b86 相关 ===');
for (const s of samples) {
  const tail = s.base.slice(68);
  console.log(`nsd=${s.nsd}: base[68:] len=${tail.length} base len=${s.base.length} b86 len=${s.b86.length} b86[0:2]=${s.b86.slice(0, 2).join(',')}`);
}

// 检查 base 中间是否有明确的"边界"（如固定段 [143-154]）
console.log('\n=== base[140:155] 对比 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[140:155]=${s.base.slice(140, 155).join(',')}`);
}

// base[22:29] 会话变段
console.log('\n=== base[22:29] 会话变段 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[22:29]=${s.base.slice(22, 29).join(',')}`);
}
