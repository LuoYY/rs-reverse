/**
 * 728_exhaustive.js
 * 穷举 base 与 cd/b86 的关系
 * base[0:22] 固定 → base[22:] 是会话相关，可能是 b86 某段编码
 * 观察 base 结构：base = [22固定][22:26变化][26:56大多固定][56:...变化][尾部固定]
 * 尝试 base = [固定] + huffman(明文 basearr) + [固定]
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

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

// 观察 base 每位置跨会话的值（打印全部）
console.log('=== base 每位置（8会话） ===');
const maxLen = Math.max(...samples.map(s => s.base.length));
for (let i = 0; i < maxLen; i++) {
  const vals = samples.map(s => s.base[i] !== undefined ? s.base[i] : '-');
  const uniq = new Set(vals.filter(v => v !== '-'));
  console.log(`${String(i).padStart(3)}: ${vals.join(',')} | ${uniq.size}`);
}
