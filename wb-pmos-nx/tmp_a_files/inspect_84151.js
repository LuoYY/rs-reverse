// 看 @84151（_$k6= 赋值）所属的 JSVMP 运行时函数上下文
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// @84151 上下文
console.log('=== @84151 前后 1500 ===');
console.log(c.slice(83000, 84500));
