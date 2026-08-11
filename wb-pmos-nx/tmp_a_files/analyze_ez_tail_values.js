// _$ez 尾部明确值 vs base 绑定段
// _$ez 尾部: _$fp._$hk._$ey._$kp.247.50.60000.67402.521019862
// 这些是 keys[29-32] 变量名 + keys[41]=60000 + keys[42]=nsd + keys[47]=时间戳
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.cd);

// 检查 base 绑定段与 nsd/时间戳的关系
console.log('=== base[22:29] vs nsd vs 时间戳 ===');
live.forEach((s, i) => {
  const p22 = s.base.slice(22, 29);
  const e73 = s.base.slice(68, 73);
  console.log('#' + i, 'nsd=' + s.nsd,
    '[22:29]=' + p22.join(',') + ' ' + p22.map(v => String.fromCharCode(v)).join(''),
    '[68:73]=' + e73.join(','));
});

// 关键：nsd 是否有编码？80214 → 4 字节？
console.log('\n=== nsd → 字节 ===');
live.forEach((s, i) => {
  const n = parseInt(s.nsd, 10);
  const b4 = [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const b2 = [(n >> 8) & 255, n & 255];
  const p225 = s.base.slice(22, 25);
  console.log('#' + i, 'nsd=' + s.nsd, 'b4=' + b4.join(','), 'b2=' + b2.join(','), '[22:25]=' + p225.join(','));
});
