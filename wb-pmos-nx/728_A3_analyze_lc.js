const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
console.log('len', code.length);
// 找 _$lc 定义/赋值
let idx = 0, cnt = 0;
const occ = [];
while ((idx = code.indexOf('_$lc', idx + 1)) !== -1 && cnt < 60) { cnt++; occ.push(idx); }
console.log('_$lc 出现次数>=60，前 20 个位置:', occ.slice(0, 20).join(','));
console.log();
console.log('=== _$lc 第一次出现上下文 ===');
console.log(code.substring(Math.max(0, occ[0] - 300), occ[0] + 300));
console.log();
console.log('=== 搜索 function 定义 ===');
const defIdx = code.indexOf('function _$lc');
console.log('function _$lc:', defIdx, defIdx >= 0 ? code.substring(defIdx, defIdx + 200) : '无');
// 找所有 _$h7 引用
idx = 0; const occ2 = [];
while ((idx = code.indexOf('_$h7', idx + 1)) !== -1 && occ2.length < 30) occ2.push(idx);
console.log();
console.log('_$h7 出现前30:', occ2.join(','));
for (const i of occ2.slice(0, 5)) {
  console.log(`--- _$h7 @${i} ---`);
  console.log(code.substring(Math.max(0, i - 200), i + 150));
}
