/**
 * 564_nx_basearr_structure.js
 * 对齐 nx basearr 明文与 xb len243.js numarrJoin 段结构
 * xb len243.js 结构: numarrJoin(3, [1]段环境指纹, 10, [10]段, 7, [7]段, 0, [0]段指纹加密块, 6, [6]段keys22, 2, fixedValue20, 9, [8,0], 13, [0])
 * nx basearr: 64 00 00 24 42 7a 95 00 ad cf d9 e0 00 bd 2b 7e 2e c9 9f d5 cd 78 06 00 ...
 * 判断 nx 是否也是 numarrJoin 段结构（3,10,7,0,6,2,9,13 标记）
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

// xb len243.js 段标记顺序（numarrJoin 参数顺序即拼接顺序）
// numarrJoin 实现: 后续数组前插 length。第一个参数直接放。
// numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, seg0, 6, seg6, 2, seg2, 9, seg9, 13, seg13)
// 输出: [3, ...seg1, 10, seg10.length, ...seg10, 7, seg7.length, ...seg7, 0, seg0.length, ...seg0, ...]
// 注意: 每个后续段: [标记, 段长, ...段内容] 或 [标记, ...内容]?

const b = d[0].basearr;
console.log('S1 basearr len:', b.length);
console.log('完整:', b.map(x => x.toString(16).padStart(2, '0')).join(' '));

// 用 xb 段标记扫描：3,10,7,0,6,2,9,13
const markers = [3, 10, 7, 0, 6, 2, 9, 13];
console.log('\n段标记位置:');
for (const mk of markers) {
  const pos = [];
  for (let i = 0; i < b.length; i++) if (b[i] === mk) pos.push(i);
  if (pos.length) console.log(`  标记 ${mk}: ${pos.join(',')}`);
}

// 尝试解析 numarrJoin 段结构：段 = [标记, 长度, 内容...]
// 从 xb basearr example 验证: [3,73,1,0,33,128,...] → 3 是标记, 73 是段1长度?
console.log('\nxb basearr example 前 16:', [3, 73, 1, 0, 33, 128, 159, 173, 0, 238, 8, 77, 97, 99, 73, 110].map(x => x.toString(16).padStart(2, '0')).join(' '));

// 尝试：nx basearr 是否以固定头部 + 变长指纹
// 前 24 字节跨会话稳定（指纹常量），24-29 动态
for (let i = 0; i < 3; i++) {
  const bb = d[i].basearr;
  console.log(`\nS${i + 1}:`);
  console.log('  [0-23]:', bb.slice(0, 24).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('  [24-29]:', bb.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('  [30-68]:', bb.slice(30, 69).map(x => x.toString(16).padStart(2, '0')).join(' '));
}
