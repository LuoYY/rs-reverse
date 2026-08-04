/**
 * 728_B_base_vs_b86.js
 * 验证 base179 与 b86 的关系：
 * base179[0]=179=b86[1]？base179 是否 = b86[1:1+len]（除标记位）？
 * 若 base179 = b86[1:] → base179 也是 cd 纯切片（偏移 1）！
 */
const fs = require('fs');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

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
  if (rem === 2) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]];
    if (c0 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return bytes;
}

console.log('=========== base179 vs b86 各偏移切片 ===========');
for (const off of [1, 2, 3, 4]) {
  let matchCount = 0, totalDiff = 0;
  for (const s of trip) {
    const b86 = decodeB86(s.cd);
    let same = 0;
    for (let i = 0; i < s.base.length && i + off < b86.length; i++) {
      if (s.base[i] === b86[i + off]) same++;
    }
    const pct = (same / s.base.length * 100).toFixed(1);
    console.log(`偏移${off}: nsd=${s.nsd} base[0]=${s.base[0]} b86[${off}]=${b86[off]} 匹配 ${same}/${s.base.length} = ${pct}%`);
  }
  console.log('');
}

// 深度：base179 vs b86[1:] 差异位置（确认是否只差标记位 24+16k）
console.log('=========== base179 vs b86[1:1+len] 差异位置 ===========');
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const diffs = [];
  for (let i = 0; i < s.base.length && i + 1 < b86.length; i++) {
    if (s.base[i] !== b86[i + 1]) diffs.push(i);
  }
  console.log(`nsd=${s.nsd}: 差异(${diffs.length})=${diffs.slice(0, 20).join(',')}`);
}
