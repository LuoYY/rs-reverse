const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_ezf_patched.js', 'utf8');
// 找 _$ez 的所有赋值点（base 编码后写入 _ez）
let idx = 0, count = 0;
while ((idx = code.indexOf('_$ez', idx + 1)) >= 0 && count < 30) {
  count++;
  const ctx = code.slice(Math.max(0, idx - 80), Math.min(code.length, idx + 40));
  if (ctx.includes('=')) console.log('@' + idx, '...' + ctx.replace(/\n/g, ' ').slice(0, 120) + '...');
}
// 找可能调用 numarrEncrypt 的函数（参数含数组返回数组）
// 找 function 定义中含 huffman 码表引用的
console.log('\n=== _\$eQ (numarr2string?) ===');
console.log('_$eQ 出现:', (code.match(/_$eQ/g) || []).length);
console.log('\n=== 函数列表（含 _$ 前缀短名） ===');
const fns = code.match(/function ([_\$a-zA-Z0-9]+)\(/g);
console.log('函数数:', fns ? fns.length : 0);
// 打印 base 相关函数
fns.slice(0, 60).forEach(f => console.log(' ', f));
