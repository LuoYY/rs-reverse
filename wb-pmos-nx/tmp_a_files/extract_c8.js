// 提取 _$c8（操作数集合）和 _$ie 的定义
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$c8= 定义
let i = c.indexOf('_$c8=');
console.log('_$c8= @' + i);
if (i >= 0) console.log(c.slice(i - 20, i + 300));
// _$ie 定义（可能是数组方法）
let j = c.indexOf('_$ie=');
console.log('\n_$ie= @' + j);
if (j >= 0) console.log(c.slice(j - 30, j + 300));
// _$ie 在解释器初始化区的赋值
// 搜 _$pu（_$md 里的跳过判断）
let k = c.indexOf('function _$pu(');
console.log('\n_$pu @' + k);
if (k >= 0) {
  let depth = 0, end = -1;
  for (let x = k; x < c.length; x++) {
    if (c[x] === '{') depth++;
    else if (c[x] === '}') { depth--; if (depth === 0) { end = x; break; } }
  }
  console.log(c.slice(k, end + 1));
}
// _$c8 在 tables 里？
try {
  const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
  console.log('\ntables keys 含 _$c8?', '_$c8' in t, Object.keys(t).join(','));
} catch(e) { console.log('tables err', e.message); }
