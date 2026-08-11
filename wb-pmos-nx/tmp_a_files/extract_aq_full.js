// 提取 _$aq 函数完整实现（_$mD[615] = 编码器）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 找 function _$aq(
let i = c.indexOf('function _$aq(');
console.log('function _$aq( @' + i);
if (i < 0) {
  // 尝试 _$aq=function
  i = c.indexOf('_$aq=function');
  console.log('_$aq=function @' + i);
}
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  const fn = c.slice(i, end + 1);
  console.log('_$aq 长度:', fn.length);
  console.log('=== _$aq 源码 ===');
  console.log(fn);
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/fn__$aq_full.txt', fn);
}
// 也提取 _$fx（_$aq 调用的）
let j = c.indexOf('function _$fx(');
if (j >= 0) {
  let depth = 0, end = -1;
  for (let k = j; k < c.length; k++) {
    if (c[k] === '{') depth++;
    else if (c[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  console.log('\n=== _$fx 源码 (len=' + (end - j) + ') ===');
  console.log(c.slice(j, end + 1).slice(0, 1000));
}
