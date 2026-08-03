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
console.log('_$b1 长度:', b1body.length);
// 找 opcode 116 分支：_$hi<=116 或 ===116
for (const pat of ['_$hi<=116', '_$hi===116', '_$hi<=119', '_$hi<120', '_$hi<=120']) {
  const i = b1body.indexOf(pat);
  console.log(`--- ${pat} @${i} ---`);
  if (i >= 0) console.log(b1body.substring(Math.max(0, i - 200), i + 600));
  console.log();
}
