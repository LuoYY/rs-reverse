const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _$ae 定义
let i = c.indexOf('function _$ae(', 168107);
if (i < 0) i = c.indexOf('_$ae=function', 168107);
console.log('_$ae @' + i + ': ...' + (i >= 0 ? c.slice(i, i + 200) : '未找到'));
// opcode 119 handler（_$_s=_$a2[_$ae()]）
let j = c.indexOf('_$_s=_$a2[_$ae()];', 168107);
console.log('\n_$_s=_$a2[_$ae()] @' + j + ': ...' + (j >= 0 ? c.slice(j - 100, j + 50) : ''));
// 118 区完整
let k = c.indexOf('_$jc===118){', 168107);
console.log('\nop118 @' + k + ': ...' + (k >= 0 ? c.slice(k - 50, k + 200) : ''));
