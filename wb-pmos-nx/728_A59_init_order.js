const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 外层 dispatcher _\$_s[0] @104175：var _$ib,_$oX,_$jc=_$a5,_$bi=_$_s[0];while(1)
// opcode 0 就访问 _\$lf[13]，但 _\$lf 初始化在 opcode 267 _\$lf=[]
// 检查 opcode 0-16 的执行流：哪些 opcode 会跳转
// 打印 @104175 dispatcher 的 opcode 0-16 分支
console.log('=== _\$_s[0] dispatcher opcode 0-31 ===');
console.log(code.substring(104200, 104900));
