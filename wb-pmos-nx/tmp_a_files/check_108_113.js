const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
console.log('aebi[0][107:115]:');
for (let i = 107; i < 115; i++) console.log('  [' + i + ']=' + a0[i]);
// opcode 440 在 pc? 
const pcs440 = [];
a0.forEach((v, i) => { if (v === 440) pcs440.push(i); });
console.log('\nop440 pc:', pcs440.join(','));
const pcs427 = [];
a0.forEach((v, i) => { if (v === 427) pcs427.push(i); });
console.log('op427 pc:', pcs427.join(','));
