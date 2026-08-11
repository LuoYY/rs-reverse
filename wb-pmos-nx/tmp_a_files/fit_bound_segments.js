// ★ 同指纹组差分：pair22(7B)/env73(5B)/变体区(27B) 与 keys2(48B) 的代数关系
// base 结构: [0:22]固定头 + [22:29]pair22 + [29:68]指纹 + [68:73]env73 + [73:110]块区 + [110:137]变体 + [137:]固定尾
const d = require('../tmp_b_files/nx_vm_verify_dataset.json');
const arr = Array.isArray(d) ? d : (d.samples || []);

// 按指纹段分组
const groups = {};
arr.forEach((s, i) => {
  const fp = s.base.slice(29, 68).join(',');
  (groups[fp] = groups[fp] || []).push(i);
});
const gkeys = Object.keys(groups);
console.log('指纹组数:', gkeys.length);
gkeys.forEach(k => console.log('  组 size=' + groups[k].length + ' idx=' + groups[k].join(',')));

// 找同指纹组（size>=2）分析 pair22/env73 vs keys2
const grp = groups[gkeys.find(k => groups[k].length >= 2)];
if (!grp) { console.log('无同组样本'); process.exit(0); }
console.log('\n=== 同组样本分析 (idx=' + grp.join(',') + ') ===');
const ss = grp.map(i => arr[i]);
ss.forEach((s, i) => {
  console.log('#' + i + ' nsd=' + s.nsd + ' cd_len=' + (s.cd || '').length);
  console.log('  pair22:', s.base.slice(22, 29).join(','));
  console.log('  env73:', s.base.slice(68, 73).join(','));
  console.log('  var[110:137]:', s.base.slice(110, 137).join(','));
  console.log('  keys2:', s.keys2.slice(0, 16).join(','));
  console.log('  block:', s.block, 'pair22字段:', s.pair22, 'env68:', s.env68, 'env73字段:', s.env73);
});

// 差分：pair22 与 keys2 的关系
if (ss.length >= 2) {
  const k0 = ss[0].keys2, k1 = ss[1].keys2;
  const p0 = ss[0].base.slice(22, 29), p1 = ss[1].base.slice(22, 29);
  console.log('\nkeys2 diff:', k0.map((v, i) => v ^ k1[i]).join(','));
  console.log('pair22 diff:', p0.map((v, i) => v ^ p1[i]).join(','));
  console.log('env73 diff:', ss[0].base.slice(68, 73).map((v, i) => v ^ ss[1].base.slice(68, 73)[i]).join(','));
  
  // keys2 中哪些位置变了
  const kdiff = k0.map((v, i) => v === k1[i] ? '.' : i).filter(x => x !== '.');
  console.log('keys2 变化位置:', kdiff.join(','));
}

// 完整打印同组所有样本的 base 段（找规律）
console.log('\n=== 同组完整对比 ===');
const maxLen = Math.max(...ss.map(s => s.base.length));
for (let i = 0; i < maxLen; i++) {
  const vals = ss.map(s => s.base[i] !== undefined ? s.base[i] : '-').join(',');
  const same = ss.every(s => s.base[i] === ss[0].base[i]);
  console.log('[' + i + ']' + (same ? '=' : '≠') + ' ' + vals);
}
