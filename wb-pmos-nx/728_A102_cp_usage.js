const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 dynCode 中 $_ts.cp / cp 的使用
let idx = 0; const occ = [];
while ((idx = code.indexOf('.cp', idx + 1)) !== -1 && occ.length < 15) occ.push(idx);
console.log('.cp 出现:', occ.join(','));
for (const i of occ) console.log('@' + i + ':', code.substring(Math.max(0, i - 100), i + 100));
// 找 cp 数组索引
idx = 0; const cp2 = [];
while ((idx = code.indexOf('_$dU.cp', idx + 1)) !== -1 && cp2.length < 10) cp2.push(idx);
console.log('\n_$dU.cp 出现:', cp2.join(','));
// 找 window['$_ts'] 赋值 _\$dU 的位置
idx = code.indexOf("_$dU=window['$_ts']");
console.log('\n_$dU=window[$\'_ts\'] @', idx);
if (idx >= 0) console.log(code.substring(idx - 200, idx + 300));
