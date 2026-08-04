const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 搜索 _$h7 的所有使用模式：push / [N]= / =[...]
let idx = 0; const occ = [];
while ((idx = code.indexOf('_$h7', idx + 1)) !== -1 && occ.length < 80) occ.push(idx);
console.log('_$h7 总出现:', occ.length, '前 60:', occ.slice(0, 60).join(','));
// 找构造点：_$h7.push / _$h7[N]= / _$h7=[ / _$h7=_$iA(
for (const pat of ['_$h7.push', '_$h7[', '_$h7=[', '_$h7=_$iA(', '_$h7=_$jo(', '_$h7=_$fx(', 'var _$h7']) {
  let i = 0; const found = [];
  while ((i = code.indexOf(pat, i + 1)) !== -1 && found.length < 15) found.push(i);
  console.log(`\n--- ${pat} @${found.join(',')} ---`);
  for (const f of found.slice(0, 6)) {
    console.log(`  @${f}:`, code.substring(Math.max(0, f - 150), f + 200).replace(/\n/g, ' ').substring(0, 300));
  }
}
// 找 _\$b1 外层函数：_\$b1 在哪个函数里定义（往前找 function 并括号匹配）
const b1 = code.indexOf('function _$b1');
let depth = 0, startB1 = -1;
for (let i = b1; i >= 0; i--) {
  const c = code[i];
  if (c === '}') depth++;
  else if (c === '{') { depth--; if (depth < 0) { startB1 = i; break; } }
}
console.log('\n_$b1 所在函数体的起始 `{` @', startB1);
console.log('该函数头:', code.substring(Math.max(0, startB1 - 200), startB1 + 50).replace(/\n/g, ' '));
