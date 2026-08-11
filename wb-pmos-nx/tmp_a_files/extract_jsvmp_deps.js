// 提取 _$h7 的外部依赖函数，生成 JSVMP 执行器模块
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');

function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
// 依赖列表
const deps = ['_$cD', '_$ad', '_$lO', '_$og', '_$pu', '_$aN'];
const out = {};
for (const n of deps) {
  const fn = extractFn(n);
  out[n] = fn;
  console.log('=== ' + n + ' (len=' + fn.length + ') ===');
  console.log(fn.slice(0, 300));
  console.log();
}
// _$gL（值对象类）
let i = c.indexOf('function _$gL(');
console.log('=== _$gL (len=' + (i >= 0 ? 500 : 0) + ') ===');
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  out._$gL = c.slice(i, end + 1);
  console.log(out._$gL.slice(0, 500));
}
// _$mD[15]/[4]/[61]/[62] 和 _$mT 是什么方法
console.log('=== 字符串方法 ===');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const mD = t._$mD.val || t._$mD;
console.log('_$mD[15] =', mD[15], '_$mD[4] =', mD[4], '_$mD[61] =', mD[61], '_$mD[62] =', mD[62]);
// _$oU[43]/[96]/[6]/[18]/[48]/[35]
const oU = t._$oU.val || t._$oU;
console.log('_$oU[43] =', JSON.stringify(oU[43]), '_$oU[96] =', JSON.stringify(oU[96]), '_$oU[6] =', JSON.stringify(oU[6]), '_$oU[18] =', JSON.stringify(oU[18]), '_$oU[48] =', JSON.stringify(oU[48]), '_$oU[35] =', JSON.stringify(oU[35]));
// _$ll 关键值（从 dynCode 提取 _$ll= 定义）
let j = c.indexOf('_$ll=[');
console.log('\n_$ll=[ @' + j);
if (j >= 0) console.log(c.slice(j, j + 400));
// _$aN
let k = c.indexOf('_$aN=');
console.log('\n_$aN= @' + k);
if (k >= 0) console.log(c.slice(k - 20, k + 200));
// 保存
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_jsvmp_deps.json', JSON.stringify(out));
console.log('\nsaved nx_jsvmp_deps.json');
