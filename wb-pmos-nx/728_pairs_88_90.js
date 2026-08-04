/**
 * 728_pairs_88_90.js
 * 分析 [88][90]（400 长度字段）与 cd/b86/keys2 的关系
 * 分析 base 尾部两种模式
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== [88][90] vs b86/keys2 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: [88]=${s.base[88]} [90]=${s.base[90]}`);
  console.log(`  b86[0:4]=${s.b86.slice(0, 4).join(',')} b86[2:6]=${s.b86.slice(2, 6).join(',')}`);
  console.log(`  keys2[0:4]=${s.keys2.slice(0, 4).join(',')}`);
}

// base 尾部模式
console.log('\n=== base 尾部 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[-20:]=${s.base.slice(-20).join(',')}`);
}

// base[88] 是否 = b86 某偏移
console.log('\n=== base[88] vs b86 搜索 ===');
for (const s of samples) {
  const v = s.base[88];
  const idxs = [];
  for (let i = 0; i < s.b86.length; i++) {
    if (s.b86[i] === v) { idxs.push(i); if (idxs.length >= 5) break; }
  }
  console.log(`nsd=${s.nsd}: base[88]=${v} 在 b86 中出现位置: ${idxs.slice(0, 5).join(',')}`);
}

// base[90] 是否 = b86 某偏移
console.log('\n=== base[90] vs b86 搜索 ===');
for (const s of samples) {
  const v = s.base[90];
  const idxs = [];
  for (let i = 0; i < s.b86.length; i++) {
    if (s.b86[i] === v) { idxs.push(i); if (idxs.length >= 5) break; }
  }
  console.log(`nsd=${s.nsd}: base[90]=${v} 在 b86 中出现位置: ${idxs.slice(0, 5).join(',')}`);
}
