const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
// opcode 339/386/337 的 pc 位置
[339, 386, 337, 340, 341, 342].forEach(op => {
  const pcs = [];
  a0.forEach((v, i) => { if (v === op) pcs.push(i); });
  console.log('op' + op + ' pc:', pcs.join(','));
});
// 打印错误列号附近 pc：260474 是 handler 源码位置，对应 opcode 339 的 else 分支
// 检查 op339 的 pc（_$lj= !_$c7[...] 是 op339 分支）
