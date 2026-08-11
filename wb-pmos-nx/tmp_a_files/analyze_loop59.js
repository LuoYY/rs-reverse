const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
// pc55-72 完整（pc59-68 循环上下文）
console.log('aebi[0][55:75]:');
for (let i = 55; i < 75; i++) console.log('  [' + i + ']=' + a0[i]);
// 302 位置 pc68：_$oL+=-9 从 68→59
// 循环：59,60,61,62,63,64,65,66,67,68→59
// 59=166(_$oL+=-4), 60=100, 61=59, 62=275, 63=393, 64=372, 65=380(+3), 66=79(+1), 67=78, 68=302(-9)
// op166 _$oL+=-4：从 59 读后 _\$oL=60, -4=56 → 跳到 56！
// 那正常应该从 59 跳到 56？
console.log('\nop59 handler:');
// opcode 59 handler
const c = require('fs').readFileSync('./nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('_$jc===59){', 168107);
console.log(i >= 0 ? '  ...' + c.slice(i - 30, i + 120) : '未找到');
// op275
i = c.indexOf('_$jc===275){', 168107);
console.log('\nop275:');
console.log(i >= 0 ? '  ...' + c.slice(i - 30, i + 120) : '未找到');
// op166
i = c.indexOf('_$jc===166){', 168107);
console.log('\nop166:');
console.log(i >= 0 ? '  ...' + c.slice(i - 30, i + 120) : '未找到');
// op380
i = c.indexOf('_$jc===380){', 168107);
console.log('\nop380:');
console.log(i >= 0 ? '  ...' + c.slice(i - 30, i + 120) : '未找到');
// op78
i = c.indexOf('_$jc===78){', 168107);
console.log('\nop78:');
console.log(i >= 0 ? '  ...' + c.slice(i - 30, i + 120) : '未找到');
