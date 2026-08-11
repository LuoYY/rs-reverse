// 提取 JSVMP 解释器 _$pC（主循环）和相关闭包变量初始化
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
// _$pC 可能不存在（闭包内），搜 _$pC=
let i = c.indexOf('_$pC=');
console.log('_$pC= @' + i);
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log('_$pC 定义 (len=' + (end - i) + '):');
  console.log(c.slice(i, end + 1));
}
// 搜 _$pC 引用
let j = 0, n = 0;
while ((j = c.indexOf('_$pC', j)) >= 0 && n < 10) {
  console.log('_$pC @' + j + ': ' + c.slice(j - 20, j + 40));
  j += 4; n++;
}
// 提取 _$fX（_$cS 里用到的错误处理）和 _$k6/_$hZ 的初始化
for (const n of ['_$fX', '_$pC']) {
  const fn = extractFn(n);
  console.log('\n' + n + ':', fn.slice(0, 500));
}
