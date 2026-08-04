/**
 * 728_base_exhaustive2.js
 * 完整穷举：base[p] = f(b86[k]) 的所有 p,k 组合（XOR/加/直接）
 * 以及 base 变化段 vs 明文basearr marker 的对应
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

const withB = samples.map(s => ({ ...s, b86: decodeB86(s.cd) }));
const maxLen = Math.max(...withB.map(s => s.base.length));

// 变化位置（跨8会话 >1 unique）
const varPos = [];
for (let p = 0; p < maxLen; p++) {
  const vals = withB.map(s => s.base[p]).filter(v => v !== undefined);
  if (new Set(vals).size > 1) varPos.push(p);
}
console.log('base 变化位置:', varPos.join(','));

// 对每个变化位置，搜索 b86 全偏移的关系
console.log('\n=== base[p] = b86[k] XOR/加/直接 搜索 ===');
for (const p of varPos) {
  const vals = withB.map(s => s.base[p]).filter(v => v !== undefined);
  const minB = Math.min(...withB.map(s => s.b86.length));
  let found = [];
  for (let k = 0; k < minB; k++) {
    const xs = withB.map(s => s.base[p] ^ s.b86[k]);
    if (new Set(xs).size === 1) found.push(`base[${p}]=b86[${k}]^${xs[0]}`);
    const ds = withB.map(s => (((s.base[p] - s.b86[k]) % 256) + 256) % 256);
    if (new Set(ds).size === 1) found.push(`base[${p}]=b86[${k}]+${ds[0]}`);
    const eq = withB.map(s => s.base[p] === s.b86[k]);
    if (eq.every(x => x)) found.push(`base[${p}]=b86[${k}]`);
  }
  if (found.length) console.log(found.slice(0, 4).join(' | '));
  else console.log(`base[${p}] 无 b86 关系`);
}
