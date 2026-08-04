/**
 * 728_B_new_forms_analysis.js
 * 分析新采集 728_B_all_forms 的 base179 敏感位置与 b86/cap 的关系
 * 关键：base179[22:29]（会话段敏感）+ [68:92]（部分敏感）
 */
const fs = require('fs');
const samples = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));

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
console.log(' 新采集 base179 敏感位置 vs b86/cap');
console.log('============================================');
for (const s of samples) {
  const b86 = decodeB86(s.cd);
  const base = s.base179;
  const cap = s.cap;
  console.log(`\nnsd=${s.nsd}: base.len=${base.length} cap.len=${cap.length}`);
  console.log(`  base[22:29]=${base.slice(22, 29).join(',')}`);
  console.log(`  b86[2:9]=${b86.slice(2, 9).join(',')}  (cap 起始)`);
  console.log(`  cap[22:29]=${cap.slice(22, 29).join(',')}`);
  console.log(`  b86[24:31]=${b86.slice(24, 31).join(',')}`);
  // base[22:29] 与 b86 各偏移搜索
  const seg = base.slice(22, 29);
  let bestMatch = 0, bestOff = -1;
  for (let off = 0; off < b86.length - 6; off++) {
    let m = 0;
    for (let i = 0; i < 7; i++) if (seg[i] === b86[off + i]) m++;
    if (m > bestMatch) { bestMatch = m; bestOff = off; }
  }
  console.log(`  base[22:29] 在 b86 最佳匹配: 偏移=${bestOff} 匹配=${bestMatch}/7 值=${b86.slice(bestOff, bestOff + 7).join(',')}`);
  // base[68:92] 与 b86
  const dyn = base.slice(68, 92);
  let bestM2 = 0, bestO2 = -1;
  for (let off = 0; off < b86.length - 23; off++) {
    let m = 0;
    for (let i = 0; i < 24; i++) if (dyn[i] === b86[off + i]) m++;
    if (m > bestM2) { bestM2 = m; bestO2 = off; }
  }
  console.log(`  base[68:92] 在 b86 最佳匹配: 偏移=${bestO2} 匹配=${bestM2}/24`);
  console.log(`  base[68:92]=${dyn.join(',')}`);
  console.log(`  base[68:92] 前12: ${dyn.slice(0, 12).join(',')}`);
}
