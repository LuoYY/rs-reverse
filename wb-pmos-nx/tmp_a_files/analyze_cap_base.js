// 关键对照：cap（113 头数组）vs base（179 头）
// cap = base 的编码前形态？cap[0]=113 vs base[0]=179
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

console.log('=== cap vs base 结构对照 ===');
data.slice(0, 6).forEach((s, i) => {
  const cap = s.cap, base = s.base;
  console.log('#' + i, 'nsd=' + s.nsd);
  console.log('  cap.len=' + cap.length + ' cap[0:20]=' + cap.slice(0, 20).join(','));
  console.log('  base.len=' + base.length + ' base[0:20]=' + base.slice(0, 20).join(','));
});

// cap 的 0 位置 vs base 的 0 位置
console.log('\n=== 0 位置对照 ===');
data.slice(0, 4).forEach((s, i) => {
  const capZ = [], baseZ = [];
  s.cap.forEach((v, j) => { if (v === 0) capZ.push(j); });
  s.base.forEach((v, j) => { if (v === 0) baseZ.push(j); });
  console.log('#' + i, 'cap 0位置:', capZ.join(','), ' base 0位置:', baseZ.join(','));
});

// cap 是否 = base 的 huffman 编码？验证：henc(base) ≈ cap
// 用 huffman 码表
const huffLenMap = require('../tmp_b_files/nx_hardcode_tables.json').bitsConstraint.huffLenMap;
console.log('\nhuffLenMap 样例:', JSON.stringify(huffLenMap).slice(0, 200));
