const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// IIFE 头部 @10-500
console.log('=== @10-500 ===');
console.log(code.substring(10, 500));
// 找所有 _$bX( 调用（@7457 是函数定义开头）
let idx = 0; const calls = [];
while ((idx = code.indexOf('_$bX(', idx + 1)) !== -1 && calls.length < 15) calls.push(idx);
console.log('\n_$bX( 调用:', calls.join(','));
// 找 $_ts 的赋值点（window.$_ts 或 $_ts =）
idx = 0; const ts = [];
while ((idx = code.indexOf('$_ts=', idx + 1)) !== -1 && ts.length < 15) ts.push(idx);
console.log('$_ts= 调用:', ts.join(','));
