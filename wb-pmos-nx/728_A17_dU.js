const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$dU=', idx + 1)) !== -1 && ass.length < 40) ass.push(idx);
console.log('_$dU= 赋值前40:', ass.join(','));
for (const i of ass.slice(0, 12)) {
  console.log(`--- _$dU= @${i} ---`);
  console.log(code.substring(Math.max(0, i - 250), i + 250));
  console.log();
}
