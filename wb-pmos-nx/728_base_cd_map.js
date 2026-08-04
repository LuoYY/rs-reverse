/**
 * 728_base_cd_map.js
 * 系统分析 base 可变位置与 b86/cd 的关系
 * 假设：base[P] = b86[K] XOR 某固定常数 / 或 = b86[K] 查表
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

// 构建带 b86 的样本
const withB = samples.map(s => ({ ...s, b86: decodeB86(s.cd) }));

// 对 base 每个可变位置，检查是否 = b86[K] 或 b86[K]^C 或 b86[K]+C
console.log('=== base 可变位置 vs b86 映射搜索 ===');
const maxLen = Math.max(...withB.map(s => s.base.length));
for (let p = 22; p < maxLen; p++) {
  const vals = withB.map(s => s.base[p]).filter(v => v !== undefined);
  if (new Set(vals).size <= 1) continue;
  // 搜索 b86 中是否存在 K 使 base[p] = b86[K]（跨全部样本一致）
  const b86lens = withB.map(s => s.b86.length);
  let bestK = -1, bestCnt = 0;
  for (let K = 0; K < Math.min(...b86lens); K++) {
    let cnt = 0;
    for (const s of withB) {
      if (s.base[p] === s.b86[K]) cnt++;
    }
    if (cnt > bestCnt) { bestCnt = cnt; bestK = K; }
  }
  if (bestCnt >= 7) {
    console.log(`base[${p}] = b86[${bestK}] 命中 ${bestCnt}/8`);
  }
}

// 尝试 XOR 常数映射
console.log('\n=== base[p] = b86[K] ^ C 搜索 ===');
for (let p = 22; p < Math.min(maxLen, 70); p++) {
  const vals = withB.map(s => s.base[p]).filter(v => v !== undefined);
  if (new Set(vals).size <= 1) continue;
  for (let K = 0; K < 60; K++) {
    // 检查是否存在固定 C 使 base[p] == b86[K]^C 对所有样本成立
    const cs = withB.map(s => s.b86[K] !== undefined ? (s.base[p] ^ s.b86[K]) : null).filter(v => v !== null);
    if (cs.length === withB.length && new Set(cs).size === 1) {
      console.log(`base[${p}] = b86[${K}] ^ ${cs[0]}  ★★★`);
    }
  }
}

// 尝试差值映射 base[p] - b86[K] 固定
console.log('\n=== base[p] - b86[K] 常数搜索 ===');
for (let p = 22; p < Math.min(maxLen, 70); p++) {
  const vals = withB.map(s => s.base[p]).filter(v => v !== undefined);
  if (new Set(vals).size <= 1) continue;
  for (let K = 0; K < 60; K++) {
    const ds = withB.map(s => s.b86[K] !== undefined ? (((s.base[p] - s.b86[K]) % 256) + 256) % 256 : null).filter(v => v !== null);
    if (ds.length === withB.length && new Set(ds).size === 1) {
      console.log(`base[${p}] = b86[${K}] + ${ds[0]}  ★★★`);
    }
  }
}
