const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
[308, 426, 340, 243].forEach(op => {
  const pcs = [];
  a0.forEach((v, i) => { if (v === op) pcs.push(i); });
  console.log('op' + op + ' pc:', pcs.join(','));
});
// 错误在 op340（pc243），需 op308（_$av=String）先执行
// 若 op308 在 pc < 243，则应已执行；若 > 243 则未执行
// 看真实 sdenv 是否正常：op308 应该在初始化早期
// 检查 pc 序列是否执行了 op308
