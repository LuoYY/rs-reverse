const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _$pI 所有出现位置
let idx = 0; const occ = [];
while ((idx = code.indexOf('_$pI', idx + 1)) !== -1 && occ.length < 60) occ.push(idx);
console.log('_$pI 出现前60:', occ.join(','));
// 找 _$pI 赋值
idx = 0; const ass = [];
while ((idx = code.indexOf('_$pI=', idx + 1)) !== -1 && ass.length < 30) ass.push(idx);
console.log('\n_$pI= 赋值:', ass.join(','));
for (const i of ass) {
  console.log(`--- _$pI= @${i} ---`);
  console.log(code.substring(Math.max(0, i - 250), i + 300));
}
// 找 _$jo 定义（之前 @41190）
const defIdx = code.indexOf('function _$jo');
console.log('\n=== _$jo 定义完整 ===');
console.log(code.substring(defIdx, defIdx + 300));
// 找 _$fx 定义（_$jo 依赖）
const fxIdx = code.indexOf('function _$fx');
console.log('\n=== _$fx 定义 ===');
console.log(code.substring(fxIdx, fxIdx + 300));
