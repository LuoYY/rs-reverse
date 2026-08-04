const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找所有 _\$lf= 赋值（外层 dispatcher 内）
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$lf=', idx + 1)) !== -1 && ass.length < 20) ass.push(idx);
console.log('_$lf= 赋值:', ass.join(','));
for (const i of ass) {
  console.log(`--- @${i} ---`);
  console.log(code.substring(Math.max(0, i - 100), i + 100));
  console.log();
}
