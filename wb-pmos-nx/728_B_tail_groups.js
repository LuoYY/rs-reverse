/**
 * 728_B_tail_groups.js
 * base 尾部两组变体分析
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base 尾部 20B（从尾部数）=== ');
for (const s of samples) {
  const tail = s.base.slice(-20);
  console.log(`nsd=${s.nsd} len=${s.base.length}: ${tail.join(',')}`);
}

// 分组：按尾部最后几个字节
console.log('\n=== 尾部最后 12B ===');
for (const s of samples) {
  console.log(`nsd=${s.nsd}: ${s.base.slice(-12).join(',')}`);
}
