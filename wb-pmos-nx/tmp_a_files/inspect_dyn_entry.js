const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_op13_local_patched.js', 'utf8');
// dynCode 入口：IIFE (function(...){...})($_ts.scj,$_ts.aebi)
// 找入口调用
const tail = code.slice(-400);
console.log('=== dynCode 尾部 400 ===');
console.log(tail);

// 找 IIFE 参数（scj/aebi）
const head = code.slice(0, 300);
console.log('\n=== dynCode 头部 300 ===');
console.log(head);
