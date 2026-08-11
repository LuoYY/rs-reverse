// 找 _$pI 的定义/赋值
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
let idx = 0, n = 0;
while ((idx = c.indexOf('_$pI', idx)) >= 0 && n < 20) {
  const ctx = c.slice(Math.max(0, idx - 40), Math.min(c.length, idx + 80));
  console.log('@' + idx + ': ' + ctx.replace(/\n/g, ' '));
  idx += 4; n++;
}
// 找 _\$k0 里关键常量（从 tables_init）
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const k0 = t._$k0.val;
console.log('\n=== _$k0 关键常量 ===');
[2, 6, 8, 9, 10, 15, 25, 27, 38, 50, 51, 60, 118, 120, 282, 381, 328, 276, 316, 11].forEach(i => {
  console.log('_$k0[' + i + '] = ' + k0[i]);
});
