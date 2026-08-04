const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
let idx = 0; const a5 = [];
while ((idx = code.indexOf('_$a5', idx + 1)) !== -1 && a5.length < 20) a5.push(idx);
console.log('_$a5 引用:', a5.join(','));
for (const i of a5) console.log('@' + i + ':', code.substring(Math.max(0, i - 60), i + 60));
