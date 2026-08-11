// 查 _$dI 依赖：_$oU[175]、_$mS、_$mG、_$oz、_$_T 的上下文
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const oU = t._$oU.val || t._$oU;
console.log('_$oU[175] =', JSON.stringify(oU[175]));
console.log('_$oU[18] =', JSON.stringify(oU[18]));
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) { i = c.indexOf(name + '=function('); }
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
console.log('=== _$mS ===');
console.log(extractFn('_$mS').slice(0, 300));
console.log('=== _$mG ===');
console.log(extractFn('_$mG').slice(0, 300));
console.log('=== _$oz ===');
console.log(extractFn('_$oz').slice(0, 300));
// _$dI 完整
console.log('=== _$dI 完整 ===');
const dI = c.indexOf('function _$dI(');
if (dI >= 0) {
  let depth = 0, end = -1;
  for (let j = dI; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log(c.slice(dI, end + 1));
}
