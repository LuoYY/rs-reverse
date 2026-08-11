const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
console.log('opcode 372 位置:');
a0.forEach((v, i) => { if (v === 372) console.log('  pc[' + i + ']=372'); });
console.log('opcode 79 位置:');
a0.forEach((v, i) => { if (v === 79) console.log('  pc[' + i + ']=79'); });
// pc12-22 完整（循环段）
console.log('\naebi[0][11:25]:');
for (let i = 11; i < 25; i++) console.log('  [' + i + ']=' + a0[i]);
