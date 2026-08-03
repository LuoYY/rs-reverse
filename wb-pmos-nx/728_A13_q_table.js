const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _$$q 赋值
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$$q=', idx + 1)) !== -1 && ass.length < 30) ass.push(idx);
console.log('_$$q= 赋值:', ass.join(','));
for (const i of ass) {
  console.log(`--- _$$q= @${i} ---`);
  console.log(code.substring(Math.max(0, i - 400), i + 400));
  console.log();
}
// 找 _$$q 首次出现（声明/引用）
idx = 0; const occ = [];
while ((idx = code.indexOf('_$$q', idx + 1)) !== -1 && occ.length < 20) occ.push(idx);
console.log('_$$q 前20出现:', occ.join(','));
// 找 _$hi dispatcher 所在函数头（80679 之前最近的 function 定义）
const pos = 80679;
const preFn = code.lastIndexOf('function', pos);
console.log('\n报错点前最近的 function @', preFn, ':', code.substring(preFn, preFn + 200));
// 80679 属于哪个函数体：往前找大函数（>3000 字符到下一个 function）
console.log('\n=== 80679 所在函数体头部 ===');
console.log(code.substring(Math.max(0, preFn - 100), preFn + 500));
