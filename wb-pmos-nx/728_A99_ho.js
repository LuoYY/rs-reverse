const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
let idx = 0; const ho = [];
while ((idx = code.indexOf('_$ho', idx + 1)) !== -1 && ho.length < 20) ho.push(idx);
console.log('_$ho 引用:', ho.join(','));
for (const i of ho) console.log('@' + i + ':', code.substring(Math.max(0, i - 80), i + 80));
