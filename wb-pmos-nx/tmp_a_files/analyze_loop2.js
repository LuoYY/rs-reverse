const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
console.log('aebi[0][55:72]:');
for (let i = 55; i < 72; i++) console.log('  [' + i + ']=' + a0[i]);
// 轨迹：63->66 (op372), 67->59 (op302)
// pc63=372? aebi[0][63] 应该=372
console.log('\n检查: aebi[0][63]=', a0[63], 'aebi[0][67]=', a0[67], 'aebi[0][59]=', a0[59]);
