/**
 * 576_dyn_fields.js
 * 验证 nx basearr[24-29] = execNumberByTime(4B) + execRandomByNumber(2B)
 * 用 575 号同会话数据 + 历史数据集
 */
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  console.log(`\nS${i + 1} [24-29]:`, b.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('  [24-27] 大端(execNumberByTime?):', b.slice(24, 28).reduce((a, x) => a * 256 + x, 0));
  console.log('  [28-29] (execRandomByNumber?):', b.slice(28, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
}

// 575 号数据（浏览器实测）
// basearr[24-31] = 00 49 b4 91 58 84 24 cf
// 1500ms 循环 = 58484400 (0x37c66b0), 2000ms = 78196362 (0x4a92e8a)
const b575 = [0, 0x49, 0xb4, 0x91, 0x58, 0x84, 0x24, 0xcf];
console.log('\n=== 575 号同会话 ===');
console.log('[24-27]:', b575.slice(0, 4).map(x => x.toString(16).padStart(2, '0')).join(' '), '大端:', b575.slice(0, 4).reduce((a, x) => a * 256 + x, 0));
console.log('[25-28]:', b575.slice(1, 5).map(x => x.toString(16).padStart(2, '0')).join(' '), '大端:', b575.slice(1, 5).reduce((a, x) => a * 256 + x, 0));
console.log('[26-29]:', b575.slice(2, 6).map(x => x.toString(16).padStart(2, '0')).join(' '), '大端:', b575.slice(2, 6).reduce((a, x) => a * 256 + x, 0));

// execRandomByNumber(98) 理论值：98 个 random 平均×100（0-100），方差×100
// execNumberByTime 1500ms = 58484400 = 0x37c66b0（需 4 字节 03 7c 66 b0）
console.log('\n1500ms 循环 4B 大端:', [0x03, 0x7c, 0x66, 0xb0].map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('basearr[24-27]:', b575.slice(0, 4).map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('★ 相等?', b575.slice(0, 4).join() === '0,73,124,176');
