const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _$jo 定义
const defIdx = code.indexOf('function _$jo');
console.log('function _$jo @', defIdx);
if (defIdx >= 0) console.log(code.substring(defIdx, defIdx + 3000));
// 找 _$pI 赋值
let idx = 0; const occ = [];
while ((idx = code.indexOf('_$pI=', idx + 1)) !== -1 && occ.length < 20) occ.push(idx);
console.log('\n_$pI= 位置:', occ.join(','));
for (const i of occ) {
  console.log(`--- _$pI= @${i} ---`);
  console.log(code.substring(Math.max(0, i - 200), i + 250));
}
// 找 _$pk=_$jo 之前附近，opcode 90 分支上下文
const pkIdx = code.indexOf('_$pk=_$jo');
console.log('\n_$pk=_$jo @', pkIdx);
console.log(code.substring(Math.max(0, pkIdx - 3000), pkIdx + 200));
