/**
 * 728_base_hash_test.js
 * 测试 base 变化区是否来自 cd 的哈希（MD5/SHA1/SHA256/CRC32 等）
 * 同时打印 base 结构段，供人工分析
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

console.log('=== base 全量（8样本）=== ');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: ${s.base.join(',')}`);
}

// 尝试哈希 cd 与 base 变化段
console.log('\n=== base[22:26] vs cd 哈希 ===');
const s0 = samples[0];
console.log('base[22:26]:', s0.base.slice(22, 26).join(','));

// 检查 base 中是否有 b86[0:2] 长度字段的特征
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
  console.log(`nsd=${s.nsd}: b86 len=${b86.length} b86[0:4]=${b86.slice(0, 4).join(',')} b86[end:end+8]=${b86.slice((b86[0] << 8 | b86[1]) + 2, (b86[0] << 8 | b86[1]) + 10).join(',')}`);
}
