/**
 * 728_base_cd_relation.js
 * 对比 8 样本 cd 与 base 变化段的关系
 * base 变化段: [22:26] [50] [64] [68:118] [157:]
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

console.log('=== cd 摘要 vs base 变化段 ===');
for (const s of samples) {
  const b = s.base;
  console.log(`nsd=${s.nsd}:`);
  console.log(`  cd前20=${s.cd.substring(0, 20)}`);
  console.log(`  b22:26=${b.slice(22, 26).join(',')} b50=${b[50]} b64=${b[64]}`);
  console.log(`  b68:92=${b.slice(68, 92).join(',')}`);
  console.log(`  b157:=${b.slice(157).join(',')}`);
}

// 对比 b86 前部（含 keys 信息）与 base
console.log('\n=== b86 段 vs base ===');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}
for (const s of samples) {
  const b86 = decodeB86(s.cd);
  if (!b86) continue;
  // b86 结构: [0:2] length header, [2:end] 数组, [end:] keys段
  const end = (b86[0] << 8 | b86[1]) + 2;
  console.log(`nsd=${s.nsd}: b86[2:6]=${b86.slice(2, 6).join(',')} keys段前4=${b86.slice(end, end + 4).join(',')}`);
}
