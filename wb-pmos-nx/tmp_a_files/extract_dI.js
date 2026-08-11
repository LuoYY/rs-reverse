// 提取 _$dI（操作数栈写入）和所有 JSVMP 处理器
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$dI 定义
let i = c.indexOf('function _$dI(');
console.log('function _$dI( @' + i);
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log('_$dI 源码 (len=' + (end - i) + '):');
  console.log(c.slice(i, end + 1));
}
// _$f1 的处理器定义（_$aq(){_$dI(0...）等）
// 从解释器初始化区提取所有处理器
let k = c.indexOf('function _$aq(_$aq){_$dI(0,_$aq);}');
console.log('\n处理器区 @' + k);
if (k >= 0) {
  const seg = c.slice(k, k + 3000);
  console.log(seg);
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/f1_processors.txt', seg);
}
