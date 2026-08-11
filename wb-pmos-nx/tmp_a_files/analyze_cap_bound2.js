// 决定性：cap(135B) + keys2/keys17 → [22:29]+[68:73]
// 用 16 个实时样本（有 cd/cap/keys2/base）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.keys2);
console.log('实时样本数:', live.length);

// 1. cap 结构分析：cap[0]=113 头，cap[1]=block，cap[2:6] 长度，cap[6]=0，cap[7:] 数据
console.log('\n=== cap 全览 ===');
live.forEach((s, i) => {
  const cap = s.cap;
  console.log('#' + i, 'nsd=' + s.nsd, 'blk=' + s.block, 'cap.len=' + cap.length,
    'cap[0:8]=' + cap.slice(0, 8).join(','));
});

// 2. 关键：cap 中是否有 [22:29]/[68:73] 的编码？
console.log('\n=== cap vs base 段 ===');
live.forEach((s, i) => {
  const cap = s.cap, base = s.base;
  // 在 cap 中搜索 base[22:29]/[68:73] 子串
  const capStr = cap.join(',');
  const p22 = base.slice(22, 29).join(',');
  const e73 = base.slice(68, 73).join(',');
  const b1 = base.slice(1, 8).join(',');
  console.log('#' + i,
    '[22:29]=' + base.slice(22, 29).join(','),
    'cap含:' + (capStr.includes(p22) ? 'Y' : 'n'),
    '[68:73]=' + base.slice(68, 73).join(','),
    'cap含:' + (capStr.includes(e73) ? 'Y' : 'n'));
});

// 3. cap 内部结构：cap[7:] 数据区是否 = 环境指纹？
console.log('\n=== cap[7:] 数据区 vs base[29:68] 指纹段 ===');
live.forEach((s, i) => {
  const cap = s.cap;
  const base = s.base;
  // cap 数据区可能含 base 指纹的编码
  // 对比 cap[7:50] 与 base[29:68]
  const capData = cap.slice(7, 50);
  const fp = base.slice(29, 68);
  // 检查 cap 值是否 0-63（numarr 编码）
  const maxCap = Math.max(...cap);
  const maxFp = Math.max(...fp);
  console.log('#' + i, 'cap.max=' + maxCap, 'fp.max=' + maxFp, 'cap[7:20]=' + cap.slice(7, 20).join(','));
});
