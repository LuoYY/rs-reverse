// 获取 _$c8 实际值 + _$ie 定义（_$fN(_$b1[12])）
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const k0 = t._$k0.val || t._$k0;
const b1 = t._$b1.val || t._$b1;
const oU = t._$oU.val || t._$oU;
// _$c8
const c8 = [k0[184], k0[347], k0[92], k0[261], k0[259], k0[356], k0[365], k0[263], k0[364], k0[353], k0[310], k0[270], k0[291], k0[255], k0[264], k0[343], k0[329]];
console.log('_$c8 =', JSON.stringify(c8));
// _$b1[12]
console.log('_$b1[12] =', JSON.stringify(b1[12]));
// _$b1 长度
console.log('_$b1 len:', b1.length);
// 找 _$fN 定义
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('function _$fN(');
console.log('\n_$fN @' + i);
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log(c.slice(i, end + 1));
}
// _$ie 的赋值上下文（opcode 46 分支）
let k = c.indexOf('_$ie=_$fN(_$b1[12])');
console.log('\n_$ie 赋值 @' + k);
if (k >= 0) console.log(c.slice(k - 100, k + 100));
// _$f3（_$pu 用的位表）
let m = c.indexOf('_$f3=');
console.log('\n_$f3= @' + m);
if (m >= 0) console.log(c.slice(m, m + 300));
