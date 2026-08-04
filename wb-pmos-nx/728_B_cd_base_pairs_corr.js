/**
 * 728_B_cd_base_pairs_corr.js
 * 系统分析 base 变化段 [68:] 与 cd 的关系
 * 1. base[68:] 每位置 vs b86[2:140] 每位置（XOR 常数搜索）
 * 2. base[68:] 是否 = 明文basearr 的某个变换
 * 3. base[22:29] 与 cd 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

// base[22:29] 模式 vs cd 特征
console.log('=== base[22:29] 模式 vs b86 特征 ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: b[22:29]=${s.base.slice(22, 29).join(',')} b86[2:6]=${s.b86.slice(2, 6).join(',')} b86[0:2]=${s.b86.slice(0, 2).join(',')}`);
}

// base[68:] 每位置 vs 明文basearr(b86[2:140]) 每位置 XOR 常数
console.log('\n=== base[68:] XOR 明文basearr 常数搜索 ===');
// base[68:] 长度 97-103，明文 basearr 138。取 97 个位置对比
for (let p = 0; p < 90; p++) {
  // base[68+p] vs 明文[p]
  const xs = samples.map(s => s.base[68 + p] ^ s.b86[2 + p]);
  if (new Set(xs).size === 1) console.log(`base[${68 + p}] = 明文[${p}] ^ ${xs[0]} ★★★`);
  // base[68+p] vs 明文[0] ^ 常数
}

// 更宽松：base[68:] 与明文 basearr 各偏移的 XOR
console.log('\n=== base[68:] vs 明文basearr 偏移 XOR ===');
for (let off = 0; off < 20; off++) {
  let hits = 0;
  for (let p = 0; p < Math.min(60, samples[0].base.length - 68 - off); p++) {
    const xs = samples.map(s => s.base[68 + p] ^ s.b86[2 + p + off]);
    if (new Set(xs).size === 1) hits++;
  }
  if (hits > 0) console.log(`偏移${off}: ${hits} 个位置 XOR 常数`);
}
