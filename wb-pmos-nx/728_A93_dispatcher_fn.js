const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// @104183 的 while 属于哪个函数？往前找最近的 function
const pre = code.substring(0, 104183);
const fnIdx = pre.lastIndexOf('function');
console.log('前一个 function @', fnIdx);
console.log(code.substring(fnIdx, fnIdx + 200));
// 这个函数是否在 IIFE 顶层被调用？
// 找该函数名
const fnName = code.substring(fnIdx + 9, code.indexOf('(', fnIdx));
console.log('函数名:', fnName);
// 找该函数的所有调用
let idx = 0; const calls = [];
const pat = fnName + '(';
while ((idx = code.indexOf(pat, idx + 1)) !== -1 && calls.length < 10) calls.push(idx);
console.log(fnName + '( 出现:', calls.join(','));
