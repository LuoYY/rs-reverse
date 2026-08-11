// 找 clearInterval 在 dynCode 的调用上下文
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// clearInterval 字符串
let i = c.indexOf('clearInterval');
console.log('clearInterval @' + i);
if (i >= 0) {
  console.log('上下文:', c.slice(i - 200, i + 100));
}
// 也找 setInterval
let j = c.indexOf('setInterval');
console.log('\nsetInterval @' + j);
if (j >= 0) console.log('上下文:', c.slice(j - 100, j + 100));
// 找 oU 中的 clearInterval/setInterval
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const oU = t._$oU.val || t._$oU;
oU.forEach((v, idx) => {
  if (v === 'clearInterval' || v === 'setInterval' || v === 'clearTimeout' || v === 'setTimeout') console.log('_$oU[' + idx + '] = "' + v + '"');
});
// 搜 dynCode 中 _$a2[clearInterval] 或 window.clearInterval 相关
let k = c.indexOf('_$oU[72]');
console.log('\n_$oU[72] @' + k);
