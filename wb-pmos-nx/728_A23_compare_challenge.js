const fs = require('fs');
const ch = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
const app = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
console.log('挑战 dynCode len:', ch.length);
console.log('应用 dynCode len:', app.length);
console.log('\n挑战 dynCode head:', ch.substring(0, 200));
console.log('应用 dynCode head:', app.substring(0, 200));
console.log('\n挑战 dynCode tail:', ch.substring(ch.length - 200));
console.log('应用 dynCode tail:', app.substring(app.length - 200));
// 挑战 dynCode 是否也有 _$b1（内层 VM dispatcher）？
console.log('\n挑战 含 _$b1:', ch.indexOf('_$b1'));
console.log('挑战 含 _$bX:', ch.indexOf('_$bX'));
console.log('挑战 含 _$pk:', ch.indexOf('_$pk'));
console.log('挑战 含 _\$lc:', ch.indexOf('_$lc'));
console.log('\n应用 含 _$b1:', app.indexOf('_$b1'));
console.log('应用 含 _$bX:', app.indexOf('_$bX'));
console.log('应用 含 _$pk:', app.indexOf('_$pk'));
console.log('应用 含 _\$lc:', app.indexOf('_$lc'));
