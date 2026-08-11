const d = require('./nx_ts_full2.json');
const aebi0 = d.aebi[0];
console.log('aebi[0] len:', aebi0.length);
// 打印 pc 590-625
console.log('aebi[0][590:625]:');
for (let i = 590; i <= 625 && i < aebi0.length; i++) {
  console.log('  [' + i + ']=' + aebi0[i]);
}
// 特殊：pc619 的指令值（死循环跳转点）
console.log('\n关键位置:');
console.log('  aebi[0][596] =', aebi0[596], 'aebi[0][619] =', aebi0[619]);
