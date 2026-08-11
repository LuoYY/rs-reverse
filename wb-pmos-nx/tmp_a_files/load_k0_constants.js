// 加载 tables_init 常量池，解析 JSVMP 关键常量
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
// _$k0
const k0 = t._$k0.val || t._$k0;
const oU = t._$oU.val || t._$oU;
console.log('_$k0 len:', k0.length, '_$oU len:', oU.length);
// JSVMP 关键常量
const keys = [5, 15, 16, 18, 21, 33, 34, 35, 36, 37, 38, 42, 44, 47, 56, 59, 74, 77, 99, 108, 127, 216];
console.log('=== _$k0 关键索引 ===');
keys.forEach(k => console.log('_$k0[' + k + '] =', k0[k]));
// _$oU 关键
console.log('\n=== _$oU 关键 ===');
[0, 5, 14, 17, 18, 23, 29, 43, 44, 48, 73, 100, 118, 120, 175].forEach(k => {
  console.log('_$oU[' + k + '] =', JSON.stringify(oU[k]));
});
// _$k0 中哪些值是 opcode 相关（33-37 区间）
console.log('\n=== _$k0[30:40] ===');
console.log(k0.slice(30, 40).join(','));
// 保存 k0/oU 供反编译
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_k0_ou.json', JSON.stringify({ k0, oU }));
console.log('\nsaved nx_k0_ou.json');
