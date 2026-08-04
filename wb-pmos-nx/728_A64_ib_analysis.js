const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 外层 dispatcher _\$_s[0] @104175：opcode 0-16 是初始化，其中 _\$ib 被设置
// opcode 1: _$ib= !(_$gy&&(_$ga&&_$gy))|| !_$j_;
// opcode 3: !_$ib?_$jc+=34:0 —— 如果 _$ib false，跳 34 个 opcode
// 先看这些变量的初始化：_\$gy/_\$ga/_\$j_ 在哪设置
// 找到 dispatcher 前的初始化（opcode < 0? 或函数开始）
// 外层 dispatcher 是 IIFE 里第一个 while(1)，_\$gy 等在更早的代码？
// 搜索 _\$gy 赋值
let idx = 0; const gy = [];
while ((idx = code.indexOf('_$gy=', idx + 1)) !== -1 && gy.length < 15) gy.push(idx);
console.log('_$gy= 赋值:', gy.join(','));
for (const i of gy.slice(0, 5)) console.log('@' + i + ':', code.substring(Math.max(0, i - 150), i + 150));
console.log();
// _\$ga 赋值
idx = 0; const ga = [];
while ((idx = code.indexOf('_$ga=', idx + 1)) !== -1 && ga.length < 15) ga.push(idx);
console.log('_$ga= 赋值:', ga.join(','));
for (const i of ga.slice(0, 5)) console.log('@' + i + ':', code.substring(Math.max(0, i - 150), i + 150));
