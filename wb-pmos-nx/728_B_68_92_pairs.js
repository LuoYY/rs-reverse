/**
 * 728_B_68_92_pairs.js
 * 用 pairs 数据集（10 样本含 b86）分析 base[68:92] 与 cd/b86 的关系
 * 重点：base[68:92] 是否 = b86[2+off] 的某种变换
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== pairs base[68:92] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: ${s.base.slice(68, 92).join(',')}`);
}

// base[68:92] 是否在 b86 中出现（子串搜索）
console.log('\n=== base[68:92] 在 b86 中搜索 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 92);
  const bStr = s.b86.join(',');
  // 搜索 8 字节子串
  let found = false;
  for (let L = 12; L >= 6 && !found; L--) {
    for (let off = 0; off <= 24 - L; off++) {
      const sub = seg.slice(off, off + L).join(',');
      if (bStr.indexOf(sub) !== -1) {
        console.log(`nsd=${s.nsd}: base[${68 + off}:${68 + off + L}] 在 b86 出现 ★`);
        found = true;
        break;
      }
    }
  }
  if (!found) console.log(`nsd=${s.nsd}: base[68:92] 未在 b86 出现`);
}

// base[68:92] 与 b86[0:2]（长度头）或 b86 前部的关系
console.log('\n=== base[68] vs b86 特征 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[68]=${s.base[68]} b86[0:2]=${s.b86.slice(0, 2).join(',')} b86[2:6]=${s.b86.slice(2, 6).join(',')}`);
}
