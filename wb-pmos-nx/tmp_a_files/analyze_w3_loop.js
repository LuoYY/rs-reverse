const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
// 打印 pc 0-25 完整 opcode 序列，理解循环
console.log('aebi[0][0:30]:');
for (let i = 0; i < 30; i++) console.log('  [' + i + ']=' + a0[i]);
// pc20=302 跳回 11，看 302 的 handler 是 _$oL+=-9（从 20 到 11 需要 -9，即 _\$oL 在 pc19 读入后=20，-9=11）
// 302 是无条件回跳。循环：11→19→20→11
// 这个循环什么时候退出？302 附近可能有其他 opcode 影响
// 找 aebi[0] 中 302 后面（21-30）看是否有跳出
console.log('\naebi[0][20:40]:');
for (let i = 20; i < 40; i++) console.log('  [' + i + ']=' + a0[i]);
