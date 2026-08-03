const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// _$b1 是内层 VM dispatcher：_$ll=_$aq._$gS（bytecode 字符串），_$hi 是 opcode，_$lc 是栈对象
// 分析 _$b1 的参数来源：搜索 _$b1( 调用
let idx = 0; const calls = [];
while ((idx = code.indexOf('_$b1(', idx + 1)) !== -1 && calls.length < 20) calls.push(idx);
console.log('_$b1( 调用位置:', calls.join(','));
for (const i of calls) {
  console.log(`--- _$b1( @${i} ---`);
  console.log(code.substring(Math.max(0, i - 300), i + 300));
  console.log();
}
// 找 _$$N 定义（_$$N._$f2() 是栈工厂）
idx = code.indexOf('_$$N=');
console.log('_$$N= @', idx);
if (idx >= 0) console.log(code.substring(Math.max(0, idx - 200), idx + 200));
// _$aq._$gS 是 bytecode 字符串：搜索 ._$gS= 赋值
idx = 0; const gs = [];
while ((idx = code.indexOf('._$gS=', idx + 1)) !== -1 && gs.length < 10) gs.push(idx);
console.log('\n._$gS= 赋值:', gs.join(','));
for (const i of gs) console.log(code.substring(Math.max(0, i - 250), i + 250));
