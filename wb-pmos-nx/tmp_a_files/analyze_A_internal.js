// A[22:25] 内部模式分析：可能 = 块索引 + 计数器 + 会话数据
// 观察：A[0]=195/194/177/178/185/192, A[1]=0/251/121/236/0/46/119, A[2]=119/214/234/232/0/212/213
// 这些可能是 [块类型][长度][校验] 的 TLV 编码
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const live = data.filter(s => s.cap && s.cap.length && s.cd);
live.forEach((s, i) => {
  console.log('#' + i, 'nsd=' + s.nsd, 'block=' + s.block,
    'A[22:25]=' + s.base.slice(22, 25).join(','),
    'B[68:70]=' + s.base.slice(68, 70).join(','),
    'cap[1]=' + s.cap[1]);
});

// 检查 block 与 A 的关系
console.log('\n=== block vs A/B ===');
const blocks = {};
live.forEach(s => { (blocks[s.block] = blocks[s.block] || []).push(s); });
Object.keys(blocks).forEach(blk => {
  const g = blocks[blk];
  console.log('block=' + blk + ' (' + g.length + '):');
  g.forEach(s => console.log('  nsd=' + s.nsd, 'A=' + s.base.slice(22, 25).join(','), 'B=' + s.base.slice(68, 70).join(',')));
});

// A[1] 或 A[2] 可能是长度标记？
// A[2]=119/214/234/232/0/212/213 → 无规律
// 但 A[1]=0/251/121/236/0/46/119 → 有 0 出现（#0/#4）
// 尝试：A 是 numarrJoin 的 [tag][len][data]?
// A[0]=tag(195=块?), A[1]=len, A[2:]=data?
// len 应该小（1-3），但 A[1]=0/251/121/236 大 → 不是 len
// 可能 A 是加密的（XOR 会话密钥）
console.log('\n=== A^B 关系 ===');
live.forEach((s, i) => {
  const a = s.base.slice(22, 25);
  const b = s.base.slice(68, 70);
  console.log('#' + i, 'A=' + a.join(','), 'B=' + b.join(','), 'A^B=' + a.map((v, j) => v ^ b[j]).join(','));
});
