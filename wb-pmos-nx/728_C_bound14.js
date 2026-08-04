/**
 * 728_C_bound14.js
 * 分析最后 14 字节绑定段（[22:29] 会话段 + [68]+[83:88]）的模板组与 cd 特征
 * 26 样本
 */
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('/tmp/728_B_all_forms.json', 'utf8'));
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;
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
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

const samples = [];
for (const s of live) samples.push({ src: 'live', nsd: s.nsd, base: s.base179, b86: decodeB86(s.cd), keys2: s.keys2 });
for (const s of pairs) samples.push({ src: 'pairs', nsd: s.nsd, base: s.base, b86: s.b86, keys2: s.keys2 });
for (const s of trip) samples.push({ src: 'triple', nsd: s.nsd, base: s.base, b86: decodeB86(s.cd), keys2: s.keys2 });

// 分组：按 [83:89] 模板 + 按 [26:29]
console.log('=== 样本总览：会话段 + 绑定段 + cd 特征 ===');
const groups = {};
for (const s of samples) {
  const b = s.base;
  const sess = b.slice(22, 29).join(',');
  const b68 = b[68];
  const tail83 = b.slice(83, 92).join(',');
  const key = `${sess} || ${b68} || ${tail83}`;
  const b861 = s.b86 && s.b86[1];
  const b862 = s.b86 && s.b86[2];
  const cdPrefix = s.b86 ? s.b86.slice(0, 10).join(',') : '?';
  console.log(`[${s.src} ${s.nsd}] sess=[${sess}] b68=${b68} tail83=[${tail83}] | b86[0:10]=[${cdPrefix}] b86[1]=${b861}`);
  (groups[key] ||= []).push(s);
}

// 关键：按 [83:89] 模板分组，看同组的 cd 特征
console.log('\n=== 按 [83:88] 分组 ===');
const grp83 = {};
for (const s of samples) {
  const b = s.base;
  const t = b.slice(83, 89).join(',');
  (grp83[t] ||= []).push(s);
}
for (const [t, list] of Object.entries(grp83)) {
  console.log(`\n组[83:88]=${t} (${list.length}样本):`);
  for (const s of list) {
    const b = s.base;
    console.log(`  nsd=${s.nsd} src=${s.src} len=${b.length} b86[1]=${s.b86 ? s.b86[1] : '?'} sess=[${b.slice(22,29).join(',')}] b68=${b[68]} b86[2:10]=${s.b86 ? s.b86.slice(2,10).join(',') : '?'}`);
  }
}

// keys2 关联检查
console.log('\n=== [83:88] 是否 = keys2 某子序列的加密? ===');
// 检查 [83:88] 与 keys2 的相似度（最长公共子串）
function lcs(a, b) {
  let best = 0, bestIdx = -1;
  for (let i = 0; i <= b.length - a.length; i++) {
    let k = 0;
    while (k < a.length && a[k] === b[i + k]) k++;
    if (k > best) { best = k; bestIdx = i; }
  }
  return [best, bestIdx];
}
for (const s of samples) {
  const b = s.base;
  const seg83 = b.slice(83, 89);
  if (!s.keys2) continue;
  const [k, idx] = lcs(seg83, s.keys2);
  const [k2, idx2] = lcs(seg83, s.b86);
  if (k >= 4 || k2 >= 4) {
    console.log(`nsd=${s.nsd}: [83:88]=[${seg83.join(',')}] keys2 LCS=${k}@${idx} b86 LCS=${k2}@${idx2}`);
  }
}
