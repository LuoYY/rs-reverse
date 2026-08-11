const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
console.log('aebi[0][222:228]:');
for (let i = 222; i < 228; i++) console.log('  [' + i + ']=' + a0[i]);
// opcode 224 handler
const c = require('fs').readFileSync('./nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('_$jc===224){', 168107);
console.log('\nop224 @' + i + ': ...' + (i >= 0 ? c.slice(i, i + 150) : ''));
// opcode 226
i = c.indexOf('_$jc===226){', 168107);
console.log('\nop226 @' + i + ': ...' + (i >= 0 ? c.slice(i, i + 100) : ''));
// opcode 425 的 handler 区（425-427）
i = c.indexOf('_$jc===424){', 168107);
console.log('\n424 区 @' + i + ': ...' + (i >= 0 ? c.slice(i, i + 400) : ''));
