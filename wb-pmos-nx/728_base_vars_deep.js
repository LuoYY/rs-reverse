/**
 * 728_base_vars_deep.js
 * 深度分析 base 变化段（22-25, 56-116）与 cd 派生数据的关系
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

// 打印各样本 base 变化段详情
console.log('=== base 变化段（22-25, 56-130）=== ');
for (const s of samples) {
  const b = s.base;
  console.log(`nsd=${s.nsd}: [22:26]=${b.slice(22, 26).join(',')} [56:70]=${b.slice(56, 70).join(',')} [70:90]=${b.slice(70, 90).join(',')}`);
}

// 检查 base[22:26] 与 cap（明文 basearr）marker 位置 24+16k 的关系
// cap[24] cap[40] cap[56] cap[72] cap[88] cap[104] cap[120] cap[136]
console.log('\n=== cap marker 位置 vs base ===');
for (const s of samples) {
  const mk = [24, 40, 56, 72, 88, 104, 120, 136].map(p => s.cap[p]);
  console.log(`nsd=${s.nsd}: cap markers=${mk.join(',')}`);
}

// base 是否有 16 字节块结构？检查 24+16k 位置的 base 值
console.log('\n=== base[24+16k] 位置值 ===');
for (const s of samples) {
  const mk = [24, 40, 56, 72, 88, 104, 120, 136, 152].map(p => s.base[p] !== undefined ? s.base[p] : '-');
  console.log(`nsd=${s.nsd}: ${mk.join(',')}`);
}
