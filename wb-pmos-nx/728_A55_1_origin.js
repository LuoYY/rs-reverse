const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _\$_1 的赋值点
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$_1=', idx + 1)) !== -1 && ass.length < 30) ass.push(idx);
console.log('_$_1= 赋值:', ass.join(','));
for (const i of ass.slice(0, 15)) {
  console.log(`--- @${i} ---`);
  console.log(code.substring(Math.max(0, i - 250), i + 250));
  console.log();
}
