// 提取真正的 JSVMP 字节码解释器：_$cS(@115906) + _$md 构建(@113375) + _$aq 包装(@115773) + _$dt/_$a8 等
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// 1. _$md 构建（@113375 区域）
const mdStart = c.lastIndexOf('function ', 113375);
console.log('=== _$md 构建区域 @' + mdStart + ' ===');
console.log(c.slice(mdStart, mdStart + 2500));

// 2. _$aq 完整（@115773 区域，向前找 function）
const aqStart = c.lastIndexOf('function ', 115773);
console.log('\n=== _$aq @' + aqStart + ' ===');
// 提取完整函数
let depth = 0, end = -1;
for (let i = c.indexOf('{', aqStart); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
console.log(c.slice(aqStart, end + 1));

// 3. _$cS 字节码解释器完整（@115906）
const cSStart = 115906;
depth = 0; end = -1;
for (let i = c.indexOf('{', cSStart); i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const interp = c.slice(cSStart, end + 1);
console.log('\n=== JSVMP 字节码解释器 _$cS 完整 (len=' + interp.length + ') ===');
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_real_interp.txt', interp);
console.log('已保存 jsvmp_real_interp.txt');
console.log(interp.slice(0, 3000));
