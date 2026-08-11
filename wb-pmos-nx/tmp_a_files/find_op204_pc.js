const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
// 找 opcode 204 在 aebi[0] 的 pc 位置
console.log('opcode 204 位置:');
a0.forEach((v, i) => { if (v === 204) console.log('  pc[' + i + ']=204'); });
console.log('opcode 302 位置:');
a0.forEach((v, i) => { if (v === 302) console.log('  pc[' + i + ']=302'); });
console.log('opcode 227 位置:');
a0.forEach((v, i) => { if (v === 227) console.log('  pc[' + i + ']=227'); });
// 打印 204 前后
const i204 = a0.indexOf(204);
console.log('\naebi[0][200:215]:');
for (let i = 200; i < 215; i++) console.log('  [' + i + ']=' + a0[i]);
