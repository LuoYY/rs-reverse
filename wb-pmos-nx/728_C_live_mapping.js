/**
 * 728_C_live_mapping.js
 * 用实时同会话数据（/tmp/728_B_all_forms.json）分析：
 * 1. base179[22:29] 会话段 vs b86/keys2/cap 的关系
 * 2. base179[68:92] 敏感区 vs b86/keys2/cap 的关系
 * 3. 会话段两种类型（233,88,0 vs 其他）与 cd 的关系
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
console.log('实时样本数:', live.length);

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

// 收集样本
const samples = [];
for (const s of live) {
  const b86 = decodeB86(s.cd);
  samples.push({ nsd: s.nsd, base: s.base179, cap: s.cap, b86, keys2: s.keys2, cd: s.cd });
}
// 与 triple 合并（注意质量，先分开分析）
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const tripSamples = [];
for (const s of trip) {
  const b86 = decodeB86(s.cd);
  tripSamples.push({ nsd: s.nsd, base: s.base, cap: s.cap, b86, keys2: s.keys2, cd: s.cd });
}

function printSample(title, ss) {
  console.log('\n=== ' + title + ' ===');
  for (const s of ss) {
    const b = s.base;
    console.log(`nsd=${s.nsd} base.len=${b.length}: [22:30]=${b.slice(22,30).join(',')} [68:92]=${b.slice(68,92).join(',')}`);
  }
}

printSample('实时样本 base[22:30] 与 base[68:92]', samples);
printSample('triple 样本 base[22:30] 与 base[68:92]', tripSamples);

// ===== 搜索: base[22:29] 会话段 vs b86 各偏移 XOR 恒定 =====
function searchXorConst(segBase, segLen, targetSamples, src, label) {
  console.log(`\n=== ${label}: base[${segBase}:${segBase + segLen}] XOR ${src} 各偏移恒定搜索 ===`);
  for (let off = 0; off < 400; off++) {
    let consistent = true;
    let pattern = null;
    for (const s of targetSamples) {
      const arr = src === 'b86' ? s.b86 : src === 'keys2' ? s.keys2 : s.cap;
      if (!arr) { consistent = false; break; }
      if (arr.length < off + segLen || s.base.length < segBase + segLen) { consistent = false; break; }
      const x = [];
      for (let k = 0; k < segLen; k++) x.push((s.base[segBase + k] ^ arr[off + k]) & 255);
      if (!pattern) pattern = x;
      else if (JSON.stringify(pattern) !== JSON.stringify(x)) { consistent = false; break; }
    }
    if (consistent) console.log(`★ ${src}[${off}] ^ base[${segBase}:${segBase + segLen}] 恒定 = [${pattern.join(',')}]`);
  }
}

searchXorConst(22, 7, samples, 'b86', '实时样本');
searchXorConst(22, 7, samples, 'keys2', '实时样本');
searchXorConst(22, 7, samples, 'cap', '实时样本');
searchXorConst(22, 7, tripSamples, 'b86', 'triple样本');
searchXorConst(22, 7, tripSamples, 'keys2', 'triple样本');
searchXorConst(22, 7, tripSamples, 'cap', 'triple样本');

// ===== 搜索: base[68:92] 敏感区（用 [68:92] 全部，看哪些段恒定）=====
for (const [segBase, segLen, name] of [[68, 24, '68:92'], [68, 2, '68:70'], [83, 7, '83:90'], [71, 1, '71:72'], [80, 1, '80:81']]) {
  searchXorConst(segBase, segLen, samples, 'b86', `实时样本 ${name}`);
  searchXorConst(segBase, segLen, samples, 'keys2', `实时样本 ${name}`);
  searchXorConst(segBase, segLen, samples, 'cap', `实时样本 ${name}`);
}

// ===== 会话段两类型分析 =====
console.log('\n=== 会话段类型 + 相关 cd 特征 ===');
for (const s of samples) {
  const b = s.base;
  const type = (b[26] === 233 && b[27] === 88 && b[28] === 0) ? 'A(233,88,0)' : 'B(其他)';
  console.log(`nsd=${s.nsd} type=${type} [22:30]=${b.slice(22,30).join(',')} | b86[1:9]=${s.b86.slice(1,9).join(',')} b86[24:34]=${s.b86.slice(24,34).join(',')}`);
}
for (const s of tripSamples) {
  const b = s.base;
  const type = (b[26] === 233 && b[27] === 88 && b[28] === 0) ? 'A(233,88,0)' : 'B(其他)';
  console.log(`nsd=${s.nsd} type=${type} [22:30]=${b.slice(22,30).join(',')} | b86[1:9]=${s.b86.slice(1,9).join(',')} b86[24:34]=${s.b86.slice(24,34).join(',')}`);
}
