const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// opcode 296-310 完整区（302 附近）
const pat = '}else if(_$jc<312){';
let i = c.indexOf(pat, 168107);
if (i < 0) i = c.indexOf('_$jc<312', 168107);
console.log('312 分支 @' + i);
console.log(c.slice(i - 50, i + 1800));
