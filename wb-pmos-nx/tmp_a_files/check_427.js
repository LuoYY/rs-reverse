const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// op426/427 区完整
let i = c.indexOf('_$jc===426){', 168107);
console.log('426 区 @' + i + ':');
if (i >= 0) console.log(c.slice(i, i + 400));
// opcode 439 附近（440 用 _$d5）
let j = c.indexOf('_$jc===440){', 168107);
console.log('\n440 区 @' + j + ':');
if (j >= 0) console.log(c.slice(j, j + 300));
// _$oU[11] 值
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const oU = t._$oU.val || t._$oU;
console.log('\n_$oU[11] =', JSON.stringify(oU[11]));
