const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
console.log('dynCode len:', c.length);
let i = c.indexOf('function _$hF(');
console.log('dynCode function _$hF( @', i);
if (i >= 0) console.log('  定义:', c.slice(i, i + 150));
['_$c4=function(', 'var _$c4', '_$c4=function', ';_$c4=', 'function _$c4('].forEach(p => {
  const k = c.indexOf(p);
  console.log('dynCode "' + p + '" @', k, k >= 0 ? '...' + c.slice(k, k + 100) : '');
});
console.log('_$hF 引用数:', (c.match(/_[$]hF/g) || []).length);
console.log('_$c4 引用数:', (c.match(/_[$]c4/g) || []).length);
