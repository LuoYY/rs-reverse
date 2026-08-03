const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 确认 tail IIFE 调用
console.log('=== tail 1000 ===');
console.log(code.substring(code.length - 1000));
// 找 _$bX 完整定义（@7572 是 _$h7 引用；_$bX 函数体从 "function _$bX(_$aq)" 开始）
const bXIdx = code.indexOf('function _$bX');
console.log('\nfunction _$bX @', bXIdx);
// 找 _$bX 函数结束：下一个 "function " 顶层
console.log('=== _$bX 前 4000 ===');
console.log(code.substring(bXIdx, bXIdx + 4000));
