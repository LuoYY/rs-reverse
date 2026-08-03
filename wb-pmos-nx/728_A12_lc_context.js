const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
const origOff = 80679;
// 打印报错点前后 2000 字符
console.log('=== 报错点前后 1500 ===');
console.log(code.substring(Math.max(0, origOff - 1200), origOff + 300));
console.log('\n=== _$lc 在报错点附近的赋值（向后找 3000） ===');
console.log(code.substring(origOff, origOff + 3000));
