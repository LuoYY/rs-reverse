// 深挖 [22:29] 结构：tail 152,233,88,0 共享 → [22:25] 变化
// 假设：[22:29] = [f(cd) 3B] + [块相关 tail 4B]
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

console.log('=== [22:29] 分组：按 tail 分组 ===');
const groups = {};
data.forEach(s => {
  const p22 = s.base.slice(22, 29);
  const tail = p22.slice(3).join(',');
  (groups[tail] = groups[tail] || []).push(s);
});
Object.keys(groups).forEach(tail => {
  const g = groups[tail];
  console.log('\ntail=' + tail + ' (' + g.length + ' 样本)');
  g.forEach(s => {
    console.log('  nsd=' + s.nsd, 'blk=' + s.block, '[22:25]=' + s.base.slice(22, 25).join(','));
  });
});

// 检查 [22:25] 是否 = f(keys2) 或 f(cd) 的确定性
console.log('\n=== [22:25] vs keys2 前段 ===');
data.slice(0, 12).forEach((s, i) => {
  const b225 = s.base.slice(22, 25);
  const k2 = s.keys2;
  console.log('#' + i, 'nsd=' + s.nsd, '[22:25]=' + b225.join(','), 'k2[0:3]=' + k2.slice(0, 3).join(','), 'k2[10:13]=' + k2.slice(10, 13).join(','), 'k2[20:23]=' + k2.slice(20, 23).join(','));
});

// 检查 [22:25] 与 cap 的关系（cap 是 113 头数组）
console.log('\n=== [22:25] vs cap ===');
data.slice(0, 12).forEach((s, i) => {
  const b225 = s.base.slice(22, 25);
  const cap = s.cap;
  if (cap && cap.length >= 30) {
    console.log('#' + i, 'cap[10:13]=' + cap.slice(10, 13).join(','), 'cap[20:23]=' + cap.slice(20, 23).join(','), '[22:25]=' + b225.join(','));
  }
});
