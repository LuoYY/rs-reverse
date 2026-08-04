const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _$hb 定义和调用
const defIdx = code.indexOf('function _$hb');
console.log('function _$hb @', defIdx);
let idx = 0; const calls = [];
while ((idx = code.indexOf('_$hb(', idx + 1)) !== -1 && calls.length < 20) calls.push(idx);
console.log('_$hb( 调用:', calls.join(','));
for (const i of calls) {
  console.log(`--- _$hb( @${i} ---`);
  console.log(code.substring(Math.max(0, i - 250), i + 250));
  console.log();
}
// 打印 _$hb 完整定义
let depth = 0, started = false, end1 = -1;
for (let i = defIdx; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end1 = i; break; } }
}
console.log('=== _$hb 定义（前 2500） ===');
console.log(code.substring(defIdx, Math.min(code.length, defIdx + 2500)));
