const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
// pc 115-120（错误前）
console.log('aebi[0][114:122]:');
for (let i = 114; i < 122; i++) console.log('  [' + i + ']=' + a0[i]);
// op337/341/342 的 handler 里哪个用 concat？
// op341: _$a2._$_y=_$k1
// op342: _$lj= !( !_$mD[58]||( !_$mD[24]|| !_$mD[20]))&&_$_b
// op340: _$mD[30]=_$d5[_$oU[51]]
// op337: _$c3=_$a2[_$oP[113]]  (window.String)
// op339: _$lj= !_$c7[_$oP[75]]  (已 patch)
// op338: !_$lj?_$oL+=-114:0 (已 patch)
console.log('\n错误点 260705 对应 opcode 341（_$a2._$_y=_$k1）');
// _$k1 是什么？
const c = require('fs').readFileSync('./nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('_$k1=', 168107);
console.log('_$k1= @' + i + (i >= 0 ? ': ...' + c.slice(i - 40, i + 60) : ''));
