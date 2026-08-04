const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
for (const pos of [72421, 97013, 101840, 102207, 7929]) {
  console.log(`=== @${pos} ===`);
  console.log(code.substring(Math.max(0, pos - 500), pos + 500));
  console.log();
}
