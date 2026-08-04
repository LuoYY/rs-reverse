const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 从尾部往前找 IIFE 体内最后的非函数定义代码
// IIFE 体最后是 })($_ts.scj,$_ts.aebi); 之前是一堆 function 定义 + 可能的启动代码
// 从 385000 往前 3000 找 "function" 定义之外的可执行语句
// 直接看 @382000-385000（_$s[4]/_$s[5] dispatcher 定义之间和之后）
console.log('=== @383800-385000 ===');
console.log(code.substring(383800, 385000));
