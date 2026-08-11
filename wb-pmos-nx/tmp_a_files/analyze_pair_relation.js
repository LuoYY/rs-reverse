// 分析 [22:25] 与 [68:71] 的配对关系（同指纹组内）
// 标准#1 和 #10 同指纹，[68:73] 相同，[22:25] 不同
// 说明 [22:25] 可以变（只要不破坏配对？）→ 测服务器前先理解配对机制
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// 找所有同指纹组且 [68:73] 相同的样本对
console.log('=== 同指纹同[68:73] 的样本对 ===');
const groups = {};
data.forEach(s => {
  const key = s.base.slice(29, 68).join(',') + '|' + s.base.slice(68, 73).join(',');
  (groups[key] = groups[key] || []).push(s);
});
Object.keys(groups).forEach(key => {
  const g = groups[key];
  if (g.length > 1) {
    console.log('\n组 (' + g.length + '样本) [68:73]=' + g[0].base.slice(68, 73).join(','));
    g.forEach(s => console.log('  ' + s.nsd, '[22:29]=' + s.base.slice(22, 29).join(',')));
  }
});

// 关键问题：[22:25] 与 [68:71] 是否有数学关系（如 [22:25] = f(某会话密钥) + [68:71] = f(同密钥不同偏移)）
// 观察：#1 和 #10 的 [68:73]=215,229,76,138,222 相同，[22:25] 不同
// 但 [#22:25]=194,0,111 vs 198,0,239 → 第一字节 194 vs 198，第三 111 vs 239
console.log('\n=== [22:25] vs [68:71] 全量 ===');
data.forEach((s, i) => {
  const a = s.base.slice(22, 25), b = s.base.slice(68, 71);
  // 尝试：a[i] + b[j] mod 256 恒定？a[i] ^ b[j] 恒定？
  const sums = a.map((v, j) => (v + b[j]) & 255);
  console.log('#' + i, 'nsd=' + s.nsd, 'A=' + a.join(','), 'B=' + b.join(','), 'sum=' + sums.join(','));
});
