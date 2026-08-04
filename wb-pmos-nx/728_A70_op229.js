const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 opcode 229 分支完整代码（_\$oX===229 和周边）
const idx = code.indexOf('_$oX===229');
console.log('@', idx);
console.log(code.substring(idx - 400, idx + 800));
