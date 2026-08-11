// 提取 _$hF 内层 dispatcher 的 while 循环（_$jZ===0 附近）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// @448925 的 while 循环
const start = c.lastIndexOf('while(1){_$jZ=_$pA[_$bs++]', 448925);
console.log('循环 @' + start);
if (start >= 0) {
  // 提取到 while 结束（找对应的 }）
  let depth = 0, end = -1;
  for (let i = start; i < c.length; i++) {
    if (c[i] === '{') depth++;
    else if (c[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  console.log('循环长度:', end - start);
  const loop = c.slice(start, end + 1);
  console.log('=== 循环开头 3000 ===');
  console.log(loop.slice(0, 3000));
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jZ_loop.txt', loop);
}
