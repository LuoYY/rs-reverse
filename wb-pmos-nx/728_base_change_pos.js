/**
 * 728_base_change_pos.js
 * 用 6 个"正常"会话（排除 94192/109585 异常）精确定位 base 的变化位置
 * 并测试变化位置与 b86 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

// 排除 94192/109585（异常：可能是 huffman bestLen 偏差或不同 decode 路径）
const NORMAL = samples.filter(s => ![94192, 109585].includes(s.nsd));
console.log('正常会话:', NORMAL.map(s => s.nsd).join(','));

const maxLen = Math.max(...NORMAL.map(s => s.base.length));
console.log('\n=== 正常会话 base 变化位置（每位置值） ===');
for (let i = 0; i < maxLen; i++) {
  const vals = NORMAL.map(s => s.base[i]);
  const uniq = new Set(vals);
  if (uniq.size > 1) {
    console.log(`[${i}] ${vals.join(',')}`);
  }
}

// 固定段汇总
console.log('\n=== 正常会话固定段 ===');
let segStart = -1;
for (let i = 0; i < maxLen; i++) {
  const vals = NORMAL.map(s => s.base[i]);
  const allSame = new Set(vals).size === 1;
  if (allSame && segStart === -1) segStart = i;
  if (!allSame && segStart !== -1) {
    console.log(`固定 [${segStart}-${i - 1}] len=${i - segStart} 值=${NORMAL[0].base.slice(segStart, i).join(',')}`);
    segStart = -1;
  }
}
if (segStart !== -1) {
  console.log(`固定 [${segStart}-${maxLen - 1}] len=${maxLen - segStart} 值=${NORMAL[0].base.slice(segStart).join(',')}`);
}

// 变化位置 vs b86 关系
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
const withB = NORMAL.map(s => ({ ...s, b86: decodeB86(s.cd) }));

console.log('\n=== 变化位置 vs b86 全偏移搜索 ===');
for (let p = 22; p < maxLen; p++) {
  const vals = NORMAL.map(s => s.base[p]);
  if (new Set(vals).size <= 1) continue;
  for (let K = 0; K < 140; K++) {
    // XOR
    const xs = NORMAL.map(s => s.base[p] ^ s.b86[K]);
    if (new Set(xs).size === 1) console.log(`base[${p}] = b86[${K}] ^ ${xs[0]} ★★★`);
    // 加法
    const ds = NORMAL.map(s => (((s.base[p] - s.b86[K]) % 256) + 256) % 256);
    if (new Set(ds).size === 1) console.log(`base[${p}] = b86[${K}] + ${ds[0]} ★`);
  }
}
