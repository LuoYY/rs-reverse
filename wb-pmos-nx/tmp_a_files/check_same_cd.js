// 检查数据集中是否有相同 cd 的样本 → 验证 base 确定性
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

console.log('样本数:', data.length);
// 检查 cd 是否有重复
const cdCount = {};
data.forEach(s => { const k = s.cd || s.nsd || ''; cdCount[k] = (cdCount[k] || 0) + 1; });
const dups = Object.entries(cdCount).filter(([k, v]) => v > 1);
console.log('重复 cd/nsd:', dups.length ? dups.map(([k, v]) => k + '×' + v).join(', ') : '无');

// 所有 nsd
console.log('\n所有 nsd:', data.map(s => s.nsd).join(', '));

// 如果有重复 → 对比其 base
if (dups.length) {
  const key = dups[0][0];
  const grp = data.filter(s => (s.cd || s.nsd || '') === key);
  console.log('\n重复组 base 对比:');
  grp.forEach((s, i) => {
    console.log('#' + i, 'base.len=' + s.base.length, 'base[0:8]=' + s.base.slice(0, 8).join(','));
    console.log('  [22:29]=' + s.base.slice(22, 29).join(','), '[68:73]=' + s.base.slice(68, 73).join(','));
  });
  // 完整对比
  if (grp.length >= 2 && grp[0].base.length === grp[1].base.length) {
    let diff = [];
    for (let i = 0; i < grp[0].base.length; i++) if (grp[0].base[i] !== grp[1].base[i]) diff.push(i);
    console.log('差异位置:', diff.length ? diff.join(',') : '★完全一致!');
  }
}
