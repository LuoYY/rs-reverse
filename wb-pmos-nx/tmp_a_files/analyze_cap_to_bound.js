// 逆向 cap → [22:29]+[68:73]：cap 是输入，base 是输出
// 8 实时样本（含 cap）分析映射关系
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// 提取含 cap 的样本（src=live）
const live = data.filter(s => s.cap && s.cap.length);
console.log('实时样本数:', live.length);

live.forEach((s, i) => {
  const cap = s.cap, base = s.base;
  const p22 = base.slice(22, 29), e73 = base.slice(68, 73);
  console.log('\n#' + i, 'nsd=' + s.nsd);
  console.log('  cap.len=' + cap.length);
  console.log('  cap[0:10]=' + cap.slice(0, 10).join(','));
  // 在 cap 中搜 p22 / e73
  const capStr = cap.join(',');
  const p22str = p22.join(',');
  const e73str = e73.join(',');
  console.log('  [22:29]=' + p22.join(',') + ' 在cap中: ' + (capStr.includes(p22str) ? '★YES' : 'no'));
  console.log('  [68:73]=' + e73.join(',') + ' 在cap中: ' + (capStr.includes(e73str) ? '★YES' : 'no'));
  // cap 尾 vs base 尾
  console.log('  cap尾4=' + cap.slice(-4).join(',') + ' base尾4=' + base.slice(-4).join(','));
  console.log('  cap[2:6]=' + cap.slice(2, 6).join(',') + ' (可能含长度)');
  console.log('  cap[6:8]=' + cap.slice(6, 8).join(','));
});

// cap 结构：cap[0]=113 固定头，cap[1]=4/5/6（长度？），cap[2:6]=数字
console.log('\n=== cap 头结构 ===');
live.forEach(s => console.log('nsd=' + s.nsd, 'cap[0:8]=' + s.cap.slice(0, 8).join(','), 'cap.len=' + s.cap.length, 'base.len=' + s.base.length));
