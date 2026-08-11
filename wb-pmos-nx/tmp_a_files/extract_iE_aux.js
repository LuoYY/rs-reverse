// 提取 _$iE 的外部依赖函数：_$iz/@112244, _$a8, _$en, _$fN, _$fF, _$cD
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

function extractFn(name, startPos) {
  let i = startPos !== undefined ? startPos : c.indexOf('function ' + name + '(');
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = c.indexOf('{', i); j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
// _$iz @112244
const iz = extractFn('_$iz', 112244);
console.log('=== _$iz ===');
console.log(iz.slice(0, 600));
// _$a8
const a8 = extractFn('_$a8');
console.log('\n=== _$a8 ===');
console.log(a8.slice(0, 400));
// _$en
const en = extractFn('_$en');
console.log('\n=== _$en ===');
console.log(en.slice(0, 300));
// _$fN
const fN = extractFn('_$fN');
console.log('\n=== _$fN ===');
console.log(fN.slice(0, 300));
// _$fF (Date 别名，可能是 var 赋值)
let i = c.indexOf('_$fF=');
console.log('\n_$fF= @' + i, i >= 0 ? c.slice(i, i + 50) : '');
// _$a2 (window)
i = c.indexOf('_$a2=window');
console.log('_$a2=window @' + i, i >= 0 ? c.slice(i, i + 30) : '');
// 保存 iz/a8/en/fN
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_aux.js', iz + '\n' + a8 + '\n' + en + '\n' + fN);
console.log('已保存 jsvmp_aux.js');
