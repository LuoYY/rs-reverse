// 查 _$mD[62]/[61]（split 函数）+ _$oU[54]
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const mD = t._$mD.val || t._$mD;
const oU = t._$oU.val || t._$oU;
console.log('_$mD[61] =', JSON.stringify(mD[61]).slice(0, 100));
console.log('_$mD[62] =', JSON.stringify(mD[62]).slice(0, 100));
console.log('_$oU[54] =', JSON.stringify(oU[54]));
console.log('_$oU[92] =', JSON.stringify(oU[92]));
// dynCode 中 _$mD[62]=_$d5[_$oU[54]] 的上下文：_$d5 是什么
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('_$mD[62]=_$d5');
console.log('\n_$mD[62]=_$d5 @' + i);
if (i >= 0) console.log(c.slice(i - 200, i + 50));
// _$d5 定义
let j = c.indexOf('_$d5=');
console.log('\n_$d5= @' + j);
if (j >= 0) console.log(c.slice(j, j + 200));
// _$mD[61]=_$d5[_$oU[92]] 上下文
let k = c.indexOf('_$mD[61]=_$d5');
console.log('\n_$mD[61]=_$d5 @' + k);
if (k >= 0) console.log(c.slice(k - 100, k + 50));
