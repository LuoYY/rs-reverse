// cap vs base 映射：cap 是 b86[2:] 解码（b86=decodeB86(cd)）
// 检查 cap 与 base 是否同构（cap[0]=113 是标记，cap[1:] 是 base 的某种编码？）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

// cap = b86[2:]，b86 = decodeB86(cd)。但数据集中已有 cap 字段
const live = data.filter(s => s.cap && s.cap.length);
console.log('实时样本:', live.length);

// cap[0]=113，cap[1]=4/5/6（长度标记），cap[2:6]=长度字段
// 关键：cap 是"压缩的 base"？检查 cap[1] 与 base 长度的关系
live.forEach(s => {
  console.log('nsd=' + s.nsd, 'cap[0]=' + s.cap[0], 'cap[1]=' + s.cap[1], 'cap[2:6]=' + s.cap.slice(2, 6).join(','),
    'cap.len=' + s.cap.length, 'base.len=' + s.base.length, 'block=' + s.block);
});

// 尝试：cap[1] 是否 = 块类型索引（A=4?B=5?C=6?）
const blockIdx = { A: 4, B: 5, C: 6, D: 7, E: 8, A2: 9 };
live.forEach(s => {
  console.log('nsd=' + s.nsd, 'block=' + s.block, 'cap[1]=' + s.cap[1], 'cap[1]+3=' + (s.cap[1] + 3));
});

// cap[2:6] = 4 字节长度：解密 base len？
// base len 164-171，cap len 135-191
console.log('\n=== cap[2:6] vs base len ===');
live.forEach(s => {
  const capLenField = s.cap.slice(2, 6);
  const n = capLenField[0] * 256 + capLenField[1];
  console.log('nsd=' + s.nsd, 'cap[2:6]=' + capLenField.join(','), 'asNum=' + n, 'base.len=' + s.base.length);
});
