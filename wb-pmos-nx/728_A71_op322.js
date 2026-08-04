const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 opcode 322 分支
const idx = code.indexOf('_$oX===322');
console.log('@', idx);
console.log(code.substring(idx - 400, idx + 400));
