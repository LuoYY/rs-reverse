// 提取 _$f3（op416）和 _$np（op137）完整初始化
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

// _$f3 完整（从 = 到 ;）
let i = c.indexOf('_$f3=[');
if (i >= 0) {
  const end = c.indexOf(';}', i);
  console.log('=== _$f3 完整 ===');
  console.log(c.slice(i, i + 900));
  // 保存原始
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/f3_init_raw.txt', c.slice(i, i + 900));
}
// _$np 完整
let j = c.indexOf("_$np={'false'");
if (j >= 0) {
  // 找结束（_$np={...};）
  let depth = 0, end = -1;
  for (let k = j; k < c.length; k++) {
    if (c[k] === '{') depth++;
    else if (c[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  console.log('\n=== _$np 完整 ===');
  console.log(c.slice(j, end + 2));
  fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/np_init_raw.txt', c.slice(j, end + 2));
}
// 对应 opcode handler 确认
console.log('\n=== op416 handler ===');
let k = c.indexOf('_$jc===416){');
console.log(c.slice(k, k + 200));
console.log('\n=== op137 handler ===');
let m = c.indexOf('_$jc===137){');
console.log(c.slice(m, m + 200));
