// 提取 _$iE 所有外部依赖：_$iz/_$en/_$fN/_$fX/_$dt
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
// 各函数位置
const positions = {
  '_$iz': 112244,
  '_$en': 112057,
};
let out = '';
for (const [name, pos] of Object.entries(positions)) {
  const fn = extractFn(name, pos);
  out += fn + '\n';
  console.log(name + ': ' + fn.length + ' 字符');
}
// _$fN
const fN = extractFn('_$fN');
out += fN + '\n';
console.log('_$fN: ' + fN.length);
// _$fX
const fX = extractFn('_$fX');
out += fX + '\n';
console.log('_$fX: ' + fX.length);
// _$dt
const dt = extractFn('_$dt');
out += dt + '\n';
console.log('_$dt: ' + dt.length);
// _$av（fromCharCode 别名，可能是 var）
let i = c.indexOf('_$av=');
console.log('_$av= @' + i + ':', i >= 0 ? c.slice(i, i + 40) : '');
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_deps_all.js', out);
console.log('已保存 jsvmp_deps_all.js');
