/** 离线 dump 环境检测函数族 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_safe.js', 'utf8');

function dumpFn(name) {
  const m = code.indexOf('function ' + name + '(');
  if (m < 0) { console.log(name + ': 未找到'); return; }
  let i = code.indexOf('{', m), stack = 0, end = -1;
  for (; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('=== ' + name + ' (' + (end - m) + ' chars) ===');
  console.log(code.substring(m, end + 1).substring(0, 1000));
  console.log('');
}
dumpFn('_$dz');
dumpFn('_$pz');
dumpFn('_$eu');
dumpFn('_$kI');
