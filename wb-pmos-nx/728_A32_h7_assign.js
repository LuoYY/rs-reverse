const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$h7=', idx + 1)) !== -1 && ass.length < 20) ass.push(idx);
console.log('_$h7= 赋值:', ass.join(','));
for (const i of ass) {
  console.log(`--- _$h7= @${i} ---`);
  console.log(code.substring(Math.max(0, i - 400), i + 400));
  console.log();
}
