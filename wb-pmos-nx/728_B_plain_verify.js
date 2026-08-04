/**
 * 728_B_plain_verify.js
 * 验证：明文 basearr（cap，100开头）== b86[2:2+len]（除标记位外）
 * 重点：动态段 [24-29] 是否 = b86[26:32]（纯 cd 切片）？
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

const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;

console.log('=========== triple 数据集：cap vs b86[2:] ===========');
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const cap = s.cap;
  const base = s.base;
  console.log(`\nnsd=${s.nsd} capLen=${cap.length} baseLen=${base.length} b86Len=${b86.length}`);
  console.log(`  cap[0:8]=${cap.slice(0, 8).join(',')} (cap 是否 100 开头? ${cap[0] === 100 ? 'YES' : 'NO -> ' + cap[0]})`);
  console.log(`  cap[24:30]=${cap.slice(24, 30).join(',')}  b86[26:32]=${b86.slice(26, 32).join(',')}  ${JSON.stringify(cap.slice(24, 30)) === JSON.stringify(b86.slice(26, 32)) ? '一致!' : '不一致'}`);

  // cap vs b86[2:2+len]
  let diffPos = [];
  for (let i = 0; i < cap.length && i + 2 < b86.length; i++) {
    if (cap[i] !== b86[i + 2]) diffPos.push(i);
  }
  console.log(`  cap vs b86[2:2+len] 差异位置(${diffPos.length}): ${diffPos.slice(0, 30).join(',')}`);

  // base vs b86[2:]（base179 加密形态，应该不匹配）
  let diffPos2 = [];
  for (let i = 0; i < base.length && i + 2 < b86.length; i++) {
    if (base[i] !== b86[i + 2]) diffPos2.push(i);
  }
  console.log(`  base179 vs b86[2:2+len] 差异位置(${diffPos2.length}): ${diffPos2.slice(0, 10).join(',')}（预期不匹配=加密形态）`);
}

// 标记位验证：若 cap 只在 24+16k 处与 b86 不同，则证明公式成立
console.log('\n=========== 标记位验证（24+16k）===========');
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const cap = s.cap;
  const marks = [24, 40, 56, 72, 88, 104, 120, 136];
  let nonMarkDiffs = [];
  for (let i = 0; i < cap.length && i + 2 < b86.length; i++) {
    if (cap[i] !== b86[i + 2] && !marks.includes(i)) nonMarkDiffs.push(i);
  }
  console.log(`nsd=${s.nsd}: 非标记位差异=${nonMarkDiffs.length > 0 ? nonMarkDiffs.join(',') : 'NONE ✓ 完全符合公式！'}`);
}
