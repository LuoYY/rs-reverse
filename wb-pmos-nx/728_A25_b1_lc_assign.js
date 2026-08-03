const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
const b1 = code.indexOf('function _$b1');
let depth = 0, started = false, end1 = -1;
for (let i = b1; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end1 = i; break; } }
}
const b1body = code.substring(b1, end1);
// 找 _$b1 内所有 _$lc 赋值
let idx = 0; const ass = [];
while ((idx = b1body.indexOf('_$lc=', idx + 1)) !== -1 && ass.length < 30) ass.push(idx);
console.log('_$b1 内 _$lc= 赋值:', ass.join(','));
for (const i of ass) {
  console.log(`--- @${i + b1} ---`);
  console.log(b1body.substring(Math.max(0, i - 120), i + 150));
  console.log();
}
// _$b1 内所有 _$h7 引用
idx = 0; const h7 = [];
while ((idx = b1body.indexOf('_$h7', idx + 1)) !== -1 && h7.length < 10) h7.push(idx);
console.log('_$b1 内 _$h7 引用:', h7.map(i => i + b1).join(','));
for (const i of h7) console.log(`@${i + b1}:`, b1body.substring(Math.max(0, i - 80), i + 80));
