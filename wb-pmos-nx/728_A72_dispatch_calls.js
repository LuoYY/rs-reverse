const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 IIFE 顶层（非函数内）的执行语句：如何启动 6 个 dispatcher
// 6 个 dispatcher：_\$s[0]@104175, _\$s[1]@225312, _\$s[2]@299620, _\$s[3]@372247, _\$s[4]@384561, _\$s[5]@385712
// IIFE 从 @10 开始 (function(_$l9,_$_s){...}) 结束 @386788
// 顶层语句应该是调用 _\$bX 或赋值 $_ts 等
// 找 tail 部分（@380000-386788）
console.log('=== @385000-386788 ===');
console.log(code.substring(385000, 386788));
