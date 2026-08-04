/**
 * 728_B_base68_source.js
 * base[68:] 的来源分析：
 * 1. base[68:] vs keys2 是否有关（keys2 是 cd 派生的 48B）
 * 2. base 中是否有 keys2 的编码
 * 3. base[22:29] 会话段 vs keys2
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

// 全量打印 base 与 keys2
console.log('=== base[22:29] vs keys2[0:7] ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: b[22:29]=${s.base.slice(22, 29).join(',')} keys2[0:7]=${s.keys2.slice(0, 7).join(',')}`);
}

// base[68:] 长度 vs keys2 长度 (48)
// base[68:] 长度 97-103，keys2 48
// 检查 base[68:68+48] 与 keys2 是否有 XOR 常数关系
console.log('\n=== base[68:116] ^ keys2 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 116);
  const x = seg.map((v, i) => v ^ s.keys2[i]);
  console.log(`nsd=${s.nsd}: ${x.join(',')}`);
}

// 检查 base 中是否包含 keys2（作为连续子串）
console.log('\n=== keys2 在 base 中搜索 ===');
for (const s of samples) {
  const bStr = s.base.join(',');
  const k2 = s.keys2.join(',');
  console.log(`nsd=${s.nsd}: ${bStr.indexOf(k2) !== -1 ? '★★ 完整出现' : '未出现'}`);
  // 部分出现
  let found = false;
  for (let L = 12; L >= 6 && !found; L--) {
    for (let off = 0; off <= s.keys2.length - L; off++) {
      const sub = s.keys2.slice(off, off + L).join(',');
      if (bStr.indexOf(sub) !== -1) {
        console.log(`  keys2[${off}:${off + L}] 在 base 出现`);
        found = true;
        break;
      }
    }
  }
}
