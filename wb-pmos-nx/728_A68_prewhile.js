const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// var 声明 @103476 到 while @104175 之间的初始化代码
console.log('=== @103476-104180 ===');
console.log(code.substring(103476, 104180));
