// 关键：会话变化 6B = [22:25](3B) + [68:71](3B)
// 检查两段是否相关（可能同源）
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

console.log('=== 会话 6B 对照 ===');
data.forEach((s, i) => {
  const a = s.base.slice(22, 25); // [22:25]
  const b = s.base.slice(68, 71); // [68:71]
  console.log('#' + i, 'nsd=' + s.nsd,
    'A[22:25]=' + a.join(','),
    'B[68:71]=' + b.join(','),
    'A^B=' + a.map((v, j) => v ^ b[j]).join(','));
});

// 检查 A^B 是否恒定
const xors = data.map(s => s.base.slice(22, 25).map((v, j) => v ^ s.base.slice(68, 71)[j]).join(','));
console.log('\nA^B 分布:', [...new Set(xors)].join(' | '));

// 检查 A 与 B 是否 = 同一会话数据的两个窗口（如 XOR 关系）
// 尝试 A = f(session_key[0:3]), B = f(session_key[3:6])
// 如果 A^B 恒定 → B = A ^ 常量 → 只需知道 A
if (new Set(xors).size === 1) {
  console.log('★ A^B 恒定 =', xors[0], '→ B = A ^ 常量');
}
