const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// opcode 224 @236123 前 800 字符（在 _\$_s[1] dispatcher 内）
console.log('=== @235400-236300 ===');
console.log(code.substring(235400, 236300));
