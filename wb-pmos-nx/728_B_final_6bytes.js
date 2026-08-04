/**
 * 728_B_final_6bytes.js
 * 最终聚焦：6 字节动态段 [24:30] 与 cd 的关系
 * 验证结论：
 * 1. cap（明文 basearr）= b86[2:2+len]，除标记位（24+16k）外
 * 2. cap[24:30] 与 b86[26:32] 只差 cap[24]（标记位），其余 5 字节完全一致
 * 3. 标记位 [24] 的性质：环境检测值（非 cd 纯函数）
 * 4. basearrB（100开头）vs cap（113开头）vs base179（179开头）三种形态关系
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

console.log('======================================================');
console.log(' 6 字节动态段 [24:30] 与 cd 的关系（triple 8 样本）');
console.log('======================================================');
console.log('\n--- 1. cap[24:30] vs b86[26:32] 逐字节对比 ---');
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  const cap6 = s.cap.slice(24, 30);
  const b866 = b86.slice(26, 32);
  const same = cap6.map((v, i) => v === b866[i] ? '=' : 'X').join('');
  console.log(`nsd=${s.nsd}: cap[24:30]=[${cap6.join(',')}] b86[26:32]=[${b866.join(',')}] 匹配=${same}`);
}

console.log('\n--- 2. 标记位位置 (24+16k) 差异统计 ---');
const marks = [24, 40, 56, 72, 88, 104, 120, 136, 152, 168];
const diffCount = marks.map(m => {
  let n = 0;
  for (const s of trip) {
    if (s.cap[m] !== undefined && decodeB86(s.cd)[m + 2] !== undefined && s.cap[m] !== decodeB86(s.cd)[m + 2]) n++;
  }
  return `${m}:${n}/${trip.length}`;
});
console.log('标记位(24+16k) 与 b86 对应位不同样本数:');
console.log('  ' + diffCount.join('  '));

// 非标记位是否全一致
console.log('\n--- 3. 非标记位一致性验证 ---');
let nonMarkDiffs = 0;
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  for (let i = 0; i < Math.min(s.cap.length, b86.length - 2); i++) {
    if (!marks.includes(i) && s.cap[i] !== b86[i + 2]) {
      nonMarkDiffs++;
      if (nonMarkDiffs < 10) console.log(`  nsd=${s.nsd} 非标记位差异 @${i}: cap=${s.cap[i]} b86=${b86[i+2]}`);
    }
  }
}
console.log(`非标记位总差异数: ${nonMarkDiffs}（应为 0）`);

console.log('\n--- 4. 标记位 [24] 跨会话值分布（环境检测特征） ---');
const m24 = trip.map(s => s.cap[24]);
console.log(`cap[24] 值: ${m24.join(',')} unique=${[...new Set(m24)].length}`);
const m25 = trip.map(s => s.cap[25]);
console.log(`cap[25] 值: ${m25.join(',')} unique=${[...new Set(m25)].length}（应=cd 切片，跨会话变）`);

console.log('\n--- 5. 三种形态开头对比 ---');
for (const s of trip.slice(0, 3)) {
  console.log(`nsd=${s.nsd}: cap[0:4]=${s.cap.slice(0, 4).join(',')} base[0:4]=${s.base.slice(0, 4).join(',')} b86[1:5]=${decodeB86(s.cd).slice(1, 5).join(',')}`);
}

console.log('\n--- 6. cap 长度 vs base 长度 vs 标记位数量 ---');
for (const s of trip) {
  const nMark = Math.ceil((s.cap.length - 24) / 16);
  console.log(`nsd=${s.nsd}: cap=${s.cap.length} base=${s.base.length} 理论标记位数=${nMark}`);
}
