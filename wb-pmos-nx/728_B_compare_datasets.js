/**
 * 728_B_compare_datasets.js
 * 对比 triple 和 pairs 数据集的 base 固定段
 */
const fs = require('fs');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;

console.log('=== triple 86155 base 全量 ===');
const t = trip.find(s => s.nsd === 86155);
console.log(t.base.join(','));
console.log('\n=== pairs 99418 base 全量 ===');
const p = pairs[0];
console.log(p.base.join(','));

console.log('\n=== triple base[29:68] ===');
for (const s of trip.filter(x => x.base[26] === 233)) {
  console.log(`${s.nsd}: ${s.base.slice(29, 68).join(',')}`);
}
console.log('\n=== pairs base[29:68] ===');
for (const s of pairs) {
  console.log(`${s.nsd}: ${s.base.slice(29, 68).join(',')}`);
}
