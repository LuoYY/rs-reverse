// 标准样本：检查 cd 是否固定（本地固定 challenge）→ 同 cd 下 base 确定性
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const std = data.filter(s => String(s.nsd).startsWith('标准'));
console.log('标准样本数:', std.length);

// 打印每个标准样本的 cd 前 40 字符 + base 前 8 + [22:29] + [68:73]
std.forEach((s, i) => {
  const cd = s.cd || '';
  console.log('#' + i, s.nsd, 'cd.len=' + cd.length, 'cd前20=' + cd.slice(0, 20));
  console.log('   base[0:8]=' + s.base.slice(0, 8).join(','), '[22:29]=' + s.base.slice(22, 29).join(','), '[68:73]=' + s.base.slice(68, 73).join(','));
});

// 检查是否有完全相同的 cd
const seen = {};
std.forEach((s, i) => {
  const cd = s.cd || '';
  if (seen[cd] !== undefined) {
    console.log('\n★ #' + seen[cd] + ' 与 #' + i + ' cd 相同!');
    console.log('  #' + seen[cd] + ' base[22:29]=' + std[seen[cd]].base.slice(22, 29).join(','));
    console.log('  #' + i + ' base[22:29]=' + std[i].base.slice(22, 29).join(','));
  } else seen[cd] = i;
});
