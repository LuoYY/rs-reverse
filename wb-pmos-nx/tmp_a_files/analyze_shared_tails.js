// 分析 [22:29] 和 [68:73] 的共享尾：是否 = 环境批次/指纹组的编码？
// 假设：base = [fixedHead] + [会话A 前3B] + [批次尾 4B] + [指纹段] + [会话B 前3B] + [批次尾 2B] + ...
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// 按指纹组（[29:68]）分组，检查组内 [22:29] 的 [25:29] 和 [68:73] 的 [71:73]
console.log('=== 指纹组 → 共享尾映射 ===');
const groups = {};
data.forEach(s => {
  const fp = s.base.slice(29, 68).join(',');
  (groups[fp] = groups[fp] || []).push(s);
});
Object.keys(groups).forEach((fp, gi) => {
  const g = groups[fp];
  const t25 = new Set(g.map(s => s.base.slice(25, 29).join(',')));
  const t71 = new Set(g.map(s => s.base.slice(71, 73).join(',')));
  const e73head = new Set(g.map(s => s.base.slice(68, 71).join(',')));
  console.log('组' + gi + ' (' + g.length + '样本): [25:29]=' + [...t25].join(' / ') + ' | [71:73]=' + [...t71].join(' / ') + ' | [68:71]=' + [...e73head].join(' / '));
});

// 对比 [25:29] 与 [71:73] 是否相关（同组内）
console.log('\n=== [25:29] vs [71:73] ===');
data.forEach((s, i) => {
  console.log('#' + i, 'nsd=' + s.nsd, '[25:29]=' + s.base.slice(25, 29).join(','), '[71:73]=' + s.base.slice(71, 73).join(','));
});
