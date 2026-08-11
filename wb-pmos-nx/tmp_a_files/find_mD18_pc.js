const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
[82, 94, 425, 320, 18, 44].forEach(op => {
  const pcs = [];
  a0.forEach((v, i) => { if (v === op) pcs.push(i); });
  console.log('op' + op + ' pc:', pcs.join(','));
});
// op320 pc429 前 50 个 opcode（看 _$mD[18] 设置 opcode 是否在）
console.log('\naebi[0][380:432]:');
for (let i = 380; i < 432; i++) console.log('  [' + i + ']=' + a0[i]);
