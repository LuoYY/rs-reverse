const d = require('./nx_ts_full2.json');
const a0 = d.aebi[0];
[177, 308, 173].forEach(op => {
  const pcs = [];
  a0.forEach((v, i) => { if (v === op) pcs.push(i); });
  console.log('op' + op + ' pc:', pcs.join(','));
});
// op177: _$av=_$fm
// 若 pc177 < pc23（op308），则 op177 先执行（_$av=_$fm），然后 op308 覆盖 _$av=String
// 若 op177 > op308，则 _$av 被覆盖成 _$fm
// 检查 _$fm 赋值
const c = require('fs').readFileSync('./nx_dynCode_full_patched.js', 'utf8');
let i = 0, n = 0;
while ((i = c.indexOf('_$fm=', i)) >= 0 && n < 8) {
  console.log('_$fm= @' + i + ': ...' + c.slice(i - 40, i + 60));
  i += 5; n++;
}
