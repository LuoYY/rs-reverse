/**
 * 728_B_dyn_verify.js
 * 验证核心假设：basearr = decodeB86(cd)[2:2+len]？
 * 若成立 → 动态段 [24-29] = b86[26:32]，纯算法直接切片即可，无需推导公式！
 */
const fs = require('fs');
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

const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

console.log('=========== pairs 数据集：basearr vs b86[2:] ===========');
for (const s of pairs) {
  const b86 = decodeB86(s.cd);
  const base = s.base;
  // 对比 base 与 b86[2:2+len]
  let match = true;
  let diffPos = [];
  for (let i = 0; i < base.length && i + 2 < b86.length; i++) {
    if (base[i] !== b86[i + 2]) { match = false; diffPos.push(i); }
  }
  console.log(`nsd=${s.nsd} baseLen=${base.length} b86Len=${b86.length} 完全一致=${match} 差异位置=${diffPos.slice(0, 20).join(',')}`);
  // 重点：动态段
  const dynBase = base.slice(24, 30);
  const dynB86 = b86.slice(26, 32);
  console.log(`  base[24:30]=${dynBase.join(',')}  b86[26:32]=${dynB86.join(',')}  ${JSON.stringify(dynBase) === JSON.stringify(dynB86) ? '一致!' : '不一致'}`);
  // 若 b86 更长，看 base 是否是 b86[2:] 的前缀
  const b86slice = b86.slice(2, 2 + base.length);
  const eqCount = base.reduce((a, v, i) => a + (v === b86slice[i] ? 1 : 0), 0);
  console.log(`  base vs b86[2:2+len] 匹配 ${eqCount}/${base.length}`);
}

console.log('\n=========== triple 数据集：base vs b86[2:] ===========');
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const base = s.base;
  let match = true;
  let diffPos = [];
  for (let i = 0; i < base.length && i + 2 < b86.length; i++) {
    if (base[i] !== b86[i + 2]) { match = false; diffPos.push(i); }
  }
  console.log(`nsd=${s.nsd} baseLen=${base.length} b86Len=${b86.length} 完全一致=${match} 差异位置=${diffPos.slice(0, 20).join(',')}`);
  const dynBase = base.slice(24, 30);
  const dynB86 = b86.slice(26, 32);
  console.log(`  base[24:30]=${dynBase.join(',')}  b86[26:32]=${dynB86.join(',')}  ${JSON.stringify(dynBase) === JSON.stringify(dynB86) ? '一致!' : '不一致'}`);
}

// 检查 b86 前 26 字节结构
console.log('\n=========== b86 头部结构（前 32 字节） ===========');
for (const s of pairs.slice(0, 3)) {
  const b86 = decodeB86(s.cd);
  console.log(`nsd=${s.nsd} b86[0:32]=${b86.slice(0, 32).join(',')}`);
}
