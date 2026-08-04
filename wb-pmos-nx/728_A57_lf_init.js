const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _\$lf 初始化：var ..._$lf...; _\$lf=[...]
let idx = code.indexOf('_$lf=');
console.log('_$lf= 首个:', idx);
if (idx >= 0) console.log(code.substring(Math.max(0, idx - 200), idx + 300));
// 找 var 声明列表里的 _$lf
idx = code.indexOf('_$lf,_');
console.log('\n_$lf,_ :', idx);
if (idx >= 0) console.log(code.substring(Math.max(0, idx - 200), idx + 200));
// opcode 231 报错：_$ib= !_$l6[_$kd[155]] / _$ib=_$lf[27]&&...  —— 这在外层 dispatcher @104175 (_$_s[0])
// 外层 dispatcher 的 while 循环在 @104175，找它的 var 声明和 _$lf 初始化
console.log('\n=== @104175 dispatcher var 声明 ===');
console.log(code.substring(104000, 104400));
