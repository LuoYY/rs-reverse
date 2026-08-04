const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 IIFE 体内的启动代码：非函数定义的可执行语句
// 用正则找 'return ' 或 '_$bX(' 或 'window[' 在 IIFE 顶层（深度浅）
// 简化：找所有 '_$bX(' 调用，以及 '_$a5=' 赋值（外层 VM 启动标志）
let idx = 0; const finds = [];
while ((idx = code.indexOf('_$a5=', idx + 1)) !== -1 && finds.length < 20) finds.push(idx);
console.log('_$a5= 赋值:', finds.join(','));
for (const i of finds.slice(0, 5)) console.log('@' + i + ':', code.substring(Math.max(0, i - 80), i + 80));
// IIFE 体内可能调用 _$bX 来启动 VM：搜 '$bX(' 全量（含定义处）
console.log('\n=== _$bX 全量出现 ===');
idx = 0; const bxs = [];
while ((idx = code.indexOf('_$bX', idx + 1)) !== -1 && bxs.length < 20) bxs.push(idx);
console.log(bxs.join(','));
for (const i of bxs.slice(0, 10)) console.log('@' + i + ':', code.substring(Math.max(0, i - 60), i + 80));
