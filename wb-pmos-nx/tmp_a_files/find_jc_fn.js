// 找 @249417（_$jc===141）所属函数 + 驱动循环
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const pos = 249417;
// 向前找最近的 function
const before = c.slice(0, pos);
let lastFn = before.lastIndexOf('function ');
console.log('最近函数 @' + lastFn + ':', c.slice(lastFn, lastFn + 100));
// 找这个函数的完整范围
let depth = 0, end = -1;
for (let i = lastFn; i < c.length; i++) {
  if (c[i] === '{') depth++;
  else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
console.log('函数结束 @' + end + ' 长度 ' + (end - lastFn));
// 函数开头的循环
const fnStart = c.slice(lastFn, lastFn + 2000);
console.log('\n=== 函数开头 1500 ===');
console.log(fnStart.slice(0, 1500));
