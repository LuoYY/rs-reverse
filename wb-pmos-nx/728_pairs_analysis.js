/**
 * 728_pairs_analysis.js
 * 用 10 样本新数据集分析 base[68+] 与 keys2/b86 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

// keys2 数据
console.log('=== keys2 前 16 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: keys2[0:16]=${s.keys2.slice(0, 16).join(',')}`);
}

// base[68:] vs keys2
console.log('\n=== base[68:] vs keys2 ===');
for (const s of samples) {
  const tail = s.base.slice(68);
  const k2 = s.keys2;
  const n = Math.min(tail.length, k2.length);
  let same = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) { if (tail[i] === k2[i]) same++; else diffs.push(i); }
  console.log(`nsd=${s.nsd}: tail=${tail.length} keys2=${k2.length} 前48相同=${same}/48`);
  if (same > 3) console.log(`  相同位置: ${diffs.length > 40 ? '多数相同' : '差异=' + diffs.join(',')}`);
}

// base[68:116] vs keys2 XOR
console.log('\n=== base[68:116] XOR keys2 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 116);
  const k2 = s.keys2;
  const x = seg.map((v, i) => v ^ k2[i]);
  console.log(`nsd=${s.nsd}: ${x.join(',')}`);
}

// 检查 b86 结构: 前 2 字节长度头, 然后数组
console.log('\n=== b86 结构 ===');
for (const s of samples) {
  const b = s.b86;
  console.log(`nsd=${s.nsd}: b86 len=${b.length} [0:2]=${b.slice(0, 2).join(',')} [2:6]=${b.slice(2, 6).join(',')}`);
}

// base 尾部固定段检查
console.log('\n=== base 尾部固定 ===');
const tails = samples.map(s => s.base.slice(-12));
console.log('尾部12B:', tails.map(t => t.join(',')).join('\n         '));
