/**
 * 728_B_verify_triple_err.js
 * 验证 triple 数据集 base 是否正确
 * 对比 triple 86155 vs pairs 99418 的 base 差异点
 */
const fs = require('fs');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const pairs = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8')).samples;

const t = trip.find(s => s.nsd === 86155);
const p = pairs.find(s => s.nsd === 99418);

console.log('=== 86155 vs 99418 base 差异 ===');
const diffs = [];
for (let i = 0; i < Math.max(t.base.length, p.base.length); i++) {
  if (t.base[i] !== p.base[i]) diffs.push(i);
}
console.log('差异位置:', diffs.join(','));
console.log('86155 len:', t.base.length, '99418 len:', p.base.length);

// 86155 与 pairs 中 base 最相似的样本
console.log('\n=== 86155 vs pairs 各样本差异数 ===');
for (const s of pairs) {
  let d = 0;
  for (let i = 0; i < Math.min(t.base.length, s.base.length); i++) {
    if (t.base[i] !== s.base[i]) d++;
  }
  console.log(`vs ${s.nsd}: ${d} 差异`);
}
