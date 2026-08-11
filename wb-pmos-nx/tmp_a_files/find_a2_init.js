const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_p302_patched.js', 'utf8');
// _$a2 初始化（=window 或类似）
for (const pat of ['_$a2=window', '_$a2=this', '_$a2=', '_$a2 =', '_$a2[_$oU[88]]']) {
  let i = c.indexOf(pat, 168107);
  console.log(pat + ' @' + i);
  if (i >= 0 && i < 347085) console.log('  ...' + c.slice(i - 60, i + 80));
}
// _$oU[88] 值
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const oU = t._$oU.val || t._$oU;
console.log('\n_$oU[88] =', JSON.stringify(oU[88]));
// opcode 227 handler 在 while(3) 内，_$a2 是否前面设置？
// 搜索 '$a2=' 所有出现（while(3) 范围）
let i = 168107, n = 0;
while ((i = c.indexOf('_$a2=', i)) >= 0 && i < 347085 && n < 20) {
  console.log('_$a2= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 5; n++;
}
