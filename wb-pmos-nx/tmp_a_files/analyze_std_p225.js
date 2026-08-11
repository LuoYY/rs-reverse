// 标准组（组10，7样本指纹相同）内 [22:25] 分析
// 这 7 个样本共享指纹 + [71:73]=225,157，只有 [22:25] 变化 → 纯会话段
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

// 标准组样本（nsd=标准#2-#9，#11，#12 中 [29:68] 相同的）
const std = data.filter(s => typeof s.nsd === 'string' && s.nsd.startsWith('标准'));
console.log('标准组样本:', std.length);

console.log('\n=== 标准组 [22:25] 全览 ===');
std.forEach((s, i) => {
  console.log('#' + i, s.nsd, '[22:25]=' + s.base.slice(22, 25).join(','), 'base.len=' + s.base.length, '[29:68]指纹头=' + s.base.slice(29, 33).join(','));
});

// 分组：按指纹段
const g = {};
std.forEach(s => { const fp = s.base.slice(29, 68).join(','); (g[fp] = g[fp] || []).push(s); });
console.log('\n标准组指纹子组:', Object.keys(g).length);
Object.keys(g).forEach(fp => {
  const grp = g[fp];
  console.log(' 子组(' + grp.length + '样本):');
  grp.forEach(s => console.log('   ' + s.nsd, '[22:25]=' + s.base.slice(22, 25).join(','), '[68:73]=' + s.base.slice(68, 73).join(',')));
});
