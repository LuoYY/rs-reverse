// dump _$oU（字符串池 196 元素）——opcode 语义中的操作名
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const fs = require('fs');
console.log('tables keys:', Object.keys(tables).join(','));
// _$oU 是字符串池
const ou = tables._$oU;
if (ou) {
  if (ou.type === 'array') {
    const arr = ou.val;
    console.log('_$oU len:', arr.length);
    console.log('_$oU[30:40]:', arr.slice(30, 40).join(','));
    // 打印全部（转字符串）
    arr.forEach((v, i) => {
      console.log(i + ': ' + JSON.stringify(v));
    });
  }
} else {
  console.log('_$oU 不在 tables？找类似');
  for (const k of Object.keys(tables)) {
    const v = tables[k];
    if (v && v.type === 'array' && v.val && v.val.length === 196) {
      console.log('找到 ' + k + ' len=196');
      v.val.forEach((x, i) => console.log(i + ': ' + JSON.stringify(x)));
    }
  }
}
