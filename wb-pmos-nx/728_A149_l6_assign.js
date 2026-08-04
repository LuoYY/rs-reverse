const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _$l6 赋值
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$l6=', idx + 1)) !== -1 && ass.length < 20) ass.push(idx);
console.log('_$l6= 赋值:', ass.join(','));
for (const i of ass.slice(0, 10)) {
  console.log('@' + i + ':', code.substring(Math.max(0, i - 120), i + 120));
  console.log();
}
// 找 _$l6 引用（前 20）
idx = 0; const ref = [];
while ((idx = code.indexOf('_$l6', idx + 1)) !== -1 && ref.length < 20) ref.push(idx);
console.log('\n_$l6 引用:', ref.join(','));
// 报错点 audio 在 opcode 274，看它附近
console.log('\n=== opcode 274 附近 ===');
const audioIdx = code.indexOf('_$eF[73]');
console.log('_$eF[73] @', audioIdx);
if (audioIdx >= 0) console.log(code.substring(audioIdx - 300, audioIdx + 100));
