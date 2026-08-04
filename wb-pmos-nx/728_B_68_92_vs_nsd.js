/**
 * 728_B_68_92_vs_nsd.js
 * base[68:92] 与 nsd 的关系
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base[68:92] vs nsd ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: ${s.base.slice(68, 92).join(',')}`);
}

// nsd 特征分析
console.log('\n=== nsd 数字特征 ===');
for (const s of samples) {
  const nsd = s.nsd;
  console.log(`nsd=${nsd}: mod256=${nsd % 256} mod16=${nsd % 16} hex=${nsd.toString(16)}`);
}

// base[68] 与 nsd mod 的关系
console.log('\n=== base[68] vs nsd ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: base[68]=${s.base[68]} nsd%256=${s.nsd % 256} nsd%8=${s.nsd % 8}`);
}
