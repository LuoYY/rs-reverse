// 检查 tables_init 的 _\$ez / _\$pL / _\$aN 等字段格式
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
for (const k of Object.keys(t)) {
  const v = t[k];
  if (k === '_$ez') {
    console.log('_$ez:', typeof v, v && typeof v.v, v && v.v && v.v.length, JSON.stringify(v).slice(0, 200));
  } else if (typeof v === 'object' && v !== null) {
    console.log(k + ':', Object.keys(v).slice(0, 8).join(','), 'len=' + (v.val ? v.val.length : '?'));
  } else {
    console.log(k + ':', typeof v);
  }
}
