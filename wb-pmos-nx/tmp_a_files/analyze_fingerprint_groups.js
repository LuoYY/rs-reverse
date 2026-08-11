// 分析 [22:67] 13 种指纹变体分组 + 与 env73 的关联
// 判断：同指纹组的样本，其 [22:29] 是否也共享
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// 用 [29:68]（agentB 定义的指纹段）分组
console.log('=== 按 [29:68] 指纹分组 ===');
const groups = {};
data.forEach(s => {
  const fp = s.base.slice(29, 68).join(',');
  (groups[fp] = groups[fp] || []).push(s);
});
const fpGroups = Object.keys(groups);
console.log('指纹组数:', fpGroups.length);
fpGroups.forEach((fp, gi) => {
  const g = groups[fp];
  console.log('\n组' + gi + ' (' + g.length + ' 样本):');
  g.forEach(s => {
    console.log('  nsd=' + s.nsd, 'blk=' + s.block, '[22:29]=' + s.base.slice(22, 29).join(','));
  });
});

// 组内 [22:29] 是否一致？
console.log('\n=== 组内 [22:29] 一致性 ===');
fpGroups.forEach((fp, gi) => {
  const g = groups[fp];
  const p22s = new Set(g.map(s => s.base.slice(22, 29).join(',')));
  const e73s = new Set(g.map(s => s.base.slice(68, 73).join(',')));
  console.log('组' + gi + ': [22:29]变体=' + p22s.size + ' [68:73]变体=' + e73s.size);
});
