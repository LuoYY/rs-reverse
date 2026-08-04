/**
 * 728_B_k2_subseq.js
 * base[68:92] 与 keys2 的序列关系（非 XOR，看是否为 keys2 的子序列/重排）
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base[68:92] vs keys2 序列 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 92);
  const k2 = s.keys2;
  // 检查 seg 是否是 k2 的子序列（保持顺序）
  let idx = 0, matched = 0;
  const matchPos = [];
  for (const v of seg) {
    const pos = k2.indexOf(v, idx);
    if (pos !== -1) { matched++; idx = pos + 1; matchPos.push(pos); }
  }
  console.log(`nsd=${s.nsd}: seg 是 k2 子序列匹配=${matched}/24 pos=${matchPos.slice(0, 15).join(',')}`);
  // 反向：k2 是否是 seg 的子序列
  let idx2 = 0, matched2 = 0;
  for (const v of k2) {
    const pos = seg.indexOf(v, idx2);
    if (pos !== -1) { matched2++; idx2 = pos + 1; }
  }
  console.log(`  k2 是 seg 子序列匹配=${matched2}/48`);
}

// base[68:92] 与 cap（明文basearr）的序列关系
console.log('\n=== base[68:92] vs cap 子序列 ===');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const NORMAL = trip.filter(s => s.base[26] === 233);
for (const s of NORMAL) {
  const seg = s.base.slice(68, 92);
  const cap = s.cap;
  let idx = 0, matched = 0;
  const matchPos = [];
  for (const v of seg) {
    const pos = cap.indexOf(v, idx);
    if (pos !== -1) { matched++; idx = pos + 1; matchPos.push(pos); }
  }
  console.log(`nsd=${s.nsd}: seg 是 cap 子序列匹配=${matched}/24 pos=${matchPos.slice(0, 12).join(',')}`);
}
