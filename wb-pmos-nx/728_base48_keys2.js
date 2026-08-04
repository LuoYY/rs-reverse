/**
 * 728_base48_keys2.js
 * 假设：base 变化区（68-116 约48字节）== keys2 或其变体
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 打印 base[68:116] 与 keys2
console.log('=== base[68:116] vs keys2 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 116);
  console.log(`nsd=${s.nsd}:`);
  console.log(`  base[68:116]=${seg.join(',')}`);
  console.log(`  keys2       =${s.keys2.join(',')}`);
  // XOR
  const x = seg.map((v, i) => v ^ s.keys2[i]);
  console.log(`  XOR=${x.join(',')}`);
}

// 检查是否有偏移关系
console.log('\n=== base[68:116] 在 b86 中的搜索 ===');
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
  const seg = s.base.slice(68, 84);
  const bStr = b86.join(',');
  const sStr = seg.join(',');
  console.log(`nsd=${s.nsd}: base[68:84] 在 b86 中: ${bStr.indexOf(sStr)}`);
}
