const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
// opcode 37 的 pc
a0.forEach((v, i) => { if (v === 37) console.log('op37 pc[' + i + ']'); });
a0.forEach((v, i) => { if (v === 172) console.log('op172 pc[' + i + ']'); });
a0.forEach((v, i) => { if (v === 426) console.log('op426 pc[' + i + ']'); });
a0.forEach((v, i) => { if (v === 340) console.log('op340 pc[' + i + ']'); });
// _$oU[2] 值
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const oU = t._$oU.val || t._$oU;
console.log('_$oU[2] =', JSON.stringify(oU[2]));
// _$c3 由 op337 设置（_$c3=_$a2[_$oP[113]] = window.String）
// op37: _$d5=_$c3[_$oU[2]] → _$d5=String[oU[2]]?
console.log('\n检查: op37=_$d5=_$c3[_$oU[2]], op337=_$c3=_$a2["String"]');
// opcode 37 执行顺序 vs op340
