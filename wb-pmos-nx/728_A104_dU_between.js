const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 在 @226123 (opcode13 _\$o$=_\$dU.cp) 到 @236123 (opcode224 _\$eF=_\$dU[0]) 之间找 _\$dU= 赋值
const seg = code.substring(226123, 236123);
let idx = 0; const ass = [];
while ((idx = seg.indexOf('_$dU=', idx + 1)) !== -1 && ass.length < 30) ass.push(idx + 226123);
console.log('_\$dU= 赋值:', ass.join(','));
for (const i of ass.slice(0, 15)) console.log('@' + i + ':', seg.substring(i - 226123 - 60, i - 226123 + 60));
