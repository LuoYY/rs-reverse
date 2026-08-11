const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_op13_local_patched.js', 'utf8');
// 找引用 _$b2 的函数（huffman 长度表 [12,1,2,3,2,5,6,7]）
console.log('_$b2 引用位置:', (code.match(/_$b2/g) || []).length);
// 找 _$b2 定义
const defIdx = code.indexOf('function _$b2');
console.log('function _$b2 @', defIdx);
// 找所有引用 _$b2 的上下文
let idx = 0, count = 0;
while ((idx = code.indexOf('_$b2', idx + 1)) >= 0 && count < 20) {
  count++;
  const ctx = code.slice(Math.max(0, idx - 60), Math.min(code.length, idx + 60));
  console.log('...' + ctx.replace(/\n/g, ' ') + '...');
}
