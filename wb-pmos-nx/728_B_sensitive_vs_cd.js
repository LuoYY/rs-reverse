/**
 * 728_B_sensitive_vs_cd.js
 * 分析 base179 敏感位置（[22:29] + [68:92]敏感位）与 cd/b86/keys 的关系
 * 数据：nx_cd_base_pairs.json（10 样本含 cd + base179）+ 728_B_all_forms.json
 * 目标：找到敏感位置与 cd 的公式
 */
const fs = require('fs');
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;

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

console.log('============================================');
console.log(' 敏感位置 [22:29] vs b86 各偏移切片');
console.log('============================================');
// 搜索 base[22:29] 在 b86 中的位置
for (const s of pairs) {
  const b86 = decodeB86(s.cd);
  const seg = s.base.slice(22, 29);
  const segStr = seg.join(',');
  // 搜索 8 字节连续匹配
  let found = -1;
  for (let off = 0; off < b86.length - 7; off++) {
    let match = 0;
    for (let i = 0; i < 7; i++) if (seg[i] === b86[off + i]) match++;
    if (match >= 4) {
      found = off;
      break;
    }
  }
  console.log(`nsd=${s.nsd} seg[22:29]=${segStr}`);
  if (found >= 0) console.log(`  → b86[${found}:${found+7}] 匹配≥4: ${b86.slice(found, found + 7).join(',')}`);
}

console.log('\n============================================');
console.log(' 敏感位置 [68:92] vs b86 各偏移切片');
console.log('============================================');
for (const s of pairs) {
  const b86 = decodeB86(s.cd);
  const dyn = s.base.slice(68, 92);
  const dynStr = dyn.join(',');
  let best = 0, bestOff = -1;
  for (let off = 0; off < b86.length - 23; off++) {
    let match = 0;
    for (let i = 0; i < 24; i++) if (dyn[i] === b86[off + i]) match++;
    if (match > best) { best = match; bestOff = off; }
  }
  console.log(`nsd=${s.nsd} dyn[68:92]=${dyn.slice(0, 12).join(',')}... 最佳b86偏移=${bestOff} 匹配=${best}/24`);
}

console.log('\n============================================');
console.log(' 敏感位置与 keys2 的关系');
console.log('============================================');
for (const s of pairs) {
  const seg = s.base.slice(22, 29);
  const dyn = s.base.slice(68, 92);
  const k2 = s.keys2;
  // [22:29] XOR keys2[0:7]
  const x1 = seg.map((v, i) => v ^ k2[i]);
  // [68:92] XOR keys2[0:24]
  const x2 = dyn.map((v, i) => v ^ k2[i]);
  console.log(`nsd=${s.nsd}`);
  console.log(`  [22:29]^k2[0:7]=${x1.join(',')}`);
  console.log(`  [68:92]^k2[0:24]=${x2.slice(0, 12).join(',')}...`);
}
