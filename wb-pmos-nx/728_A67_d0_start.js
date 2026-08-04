const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// _\$_s[0] dispatcher @104175 附近完整上下文，看 _\$jc 初始化和 opcode 0 前
console.log('=== @104000-104300 ===');
console.log(code.substring(104000, 104300));
