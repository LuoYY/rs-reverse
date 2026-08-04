const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
const kx = code.indexOf('function _$kx');
console.log('function _$kx @', kx);
// 找 _$kx 完整定义（这个函数是 _\$b1 的外层容器，很大）
let depth = 0, started = false, end1 = -1;
for (let i = kx; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end1 = i; break; } }
}
console.log('_$kx 范围:', kx, '→', end1, '长度:', end1 - kx);
console.log('=== _$kx 头部 4000 ===');
console.log(code.substring(kx, kx + 4000));
