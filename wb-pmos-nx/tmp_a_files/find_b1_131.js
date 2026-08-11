const d = require('./nx_pools_same.json');
console.log('_$b1[131] =', JSON.stringify(d.pools.b1[131]));
console.log('_$b1[175] =', JSON.stringify(d.pools.b1[175]));
// op425: _$mD[18]=_$a2[_$b1[131]]  → window[b1[131]]
// op426: _$mD[22]=_$ah[_$oU[181]]
// op425 在 pc225，op320 在 pc429
// 若 window[b1[131]] 是对象则 ok
// 查 op425 handler
const c = require('fs').readFileSync('./nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('_$jc===425){', 168107);
console.log('\nop425 @' + i + ': ...' + (i >= 0 ? c.slice(i, i + 100) : ''));
