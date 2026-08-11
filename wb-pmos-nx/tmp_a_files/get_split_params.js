// 获取 JSVMP 分割参数：_$mD[62]（split）、_$mD[61]（索引）、_$lc[57]/_$oU[61]（分隔符）、_$ll[153]
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
for (const k of ['_$k0', '_$oU', '_$lc', '_$ll', '_$b1', '_$f$', '_$mD']) {
  const v = t[k];
  const val = v && (v.val || v);
  if (Array.isArray(val)) console.log(k + ' len=' + val.length);
  else if (typeof val === 'object' && val) console.log(k + ' = object', JSON.stringify(val).slice(0, 100));
  else console.log(k + ' =', val);
}
const oU = t._$oU.val || t._$oU;
const lc = t._$lc.val || t._$lc;
const ll = t._$ll ? (t._$ll.val || t._$ll) : null;
const b1 = t._$b1.val || t._$b1;
console.log('\n_$oU[61] =', JSON.stringify(oU[61]));
console.log('_$lc[57] =', JSON.stringify(lc[57]));
if (ll) console.log('_$ll[153] =', JSON.stringify(ll[153]));
console.log('_$b1[12] =', JSON.stringify(b1[12]));
// _$mD[62]/[61] 是什么（在 dynCode 中搜）
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
for (const pat of ['_$mD[62]=', '_$mD[61]=', '_$mD[62]']) {
  let i = c.indexOf(pat);
  console.log('\n"' + pat + '" @' + i);
  if (i >= 0) console.log(c.slice(i, i + 120));
}
// _$ll 在 tables 里？
console.log('\ntables 含 _$ll?', '_$ll' in t);
// _$f$ 在 tables 里？
console.log('tables 含 _$f$?', '_$f$' in t);
