/**
 * 728_B_check_vs_cd.js
 * 分析 base 校验位置（[82],[92-98],[102],[112],[116],[142-144],[148-154],[160-162]）
 * 与 cd/keys2/b86 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

const CHECK = [82, 92, 93, 94, 95, 96, 97, 98, 102, 112, 116, 142, 143, 144, 148, 149, 150, 151, 152, 153, 154, 160, 161, 162];

// 打印校验位置值 vs keys2 前部
console.log('=== 校验位置值 vs keys2[0:8] ===');
for (const s of samples) {
  const vals = CHECK.map(p => s.base[p]);
  console.log(`nsd=${s.nsd}: chk=[${vals.join(',')}] k2[0:8]=${s.keys2.slice(0, 8).join(',')}`);
}

// 检查这些校验位置是否来自 b86 的某个偏移
console.log('\n=== 校验位置 vs b86 偏移搜索 ===');
const CHECK2 = [82, 92, 102, 112, 116];
for (const p of CHECK2) {
  console.log(`\nbase[${p}]:`);
  for (const s of samples) {
    const v = s.base[p];
    // 在 b86 中找相同值的位置
    const idxs = [];
    for (let i = 0; i < s.b86.length; i++) {
      if (s.b86[i] === v) { idxs.push(i); if (idxs.length >= 3) break; }
    }
    console.log(`  nsd=${s.nsd}: v=${v} b86位置=${idxs.slice(0, 3).join(',')}`);
  }
}
