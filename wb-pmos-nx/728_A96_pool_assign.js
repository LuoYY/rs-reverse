const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找所有属性名池赋值：_$eF= _$kd= _$oV= _$nL= _$bu= _$dn= _$iQ= _$l5=
const pools = ['_$eF', '_$kd', '_$oV', '_$nL', '_$bu', '_$dn', '_$iQ', '_$l5'];
for (const pool of pools) {
  const idx = code.indexOf(pool + '=_$dU[');
  if (idx >= 0) {
    console.log(`${pool} = _$dU[${code[idx + pool.length + 5]}] @ ${idx}`);
  } else {
    // 找任意赋值
    let i = 0; const found = [];
    while ((i = code.indexOf(pool + '=', i + 1)) !== -1 && found.length < 3) found.push(i);
    console.log(`${pool}:`, found.map(f => `@${f} ${code.substring(f, f + 60)}`).join(' | ') || '无赋值');
  }
}
// _\$dU 如何填充？看 opcode 159/242 等
let idx = 0; const dU = [];
while ((idx = code.indexOf('_$dU=', idx + 1)) !== -1 && dU.length < 20) dU.push(idx);
console.log('\n_$dU= 赋值:', dU.join(','));
for (const i of dU.slice(0, 10)) console.log('@' + i + ':', code.substring(Math.max(0, i - 100), i + 100));
