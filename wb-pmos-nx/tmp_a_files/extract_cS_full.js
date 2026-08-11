// 提取 _$cS 完整实现 + _$pC 完整 + 相关解释器闭包变量
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
// _$cS 完整
let i = c.indexOf('function _$cS(');
console.log('=== _$cS ===');
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log(c.slice(i, end + 1));
}
// _$pC 完整（@92046）
let j = c.indexOf('function _$pC()');
console.log('\n=== _$pC ===');
if (j >= 0) {
  let depth = 0, end = -1;
  for (let k = j; k < c.length; k++) {
    if (c[k] === '{') depth++;
    else if (c[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  console.log(c.slice(j, end + 1));
}
// 解释器初始化（_$k6/_$hZ/_$ie/_$f1 等，@62169 附近）
let k = c.indexOf('_$oi,_$_R,_$gx,_$gB,_$pC,_$f1;');
console.log('\n=== 解释器变量初始化 ===');
if (k >= 0) console.log(c.slice(k, k + 800));
