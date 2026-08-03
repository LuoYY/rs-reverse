/** 445 分析动态代码入口调用 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// 结尾 600 字符
console.log('=== 结尾 600 ===');
console.log(code.substring(code.length - 600));

// 找入口 IIFE 调用：})( 模式（往前找匹配）
const close = code.lastIndexOf('})(');
console.log('\n=== 入口调用 @', close, '===');
if (close >= 0) {
  console.log(code.substring(close, close + 300));
}
// 更完整：找 })(
const all = [];
let idx = 0;
while ((idx = code.indexOf('})(', idx)) !== -1) {
  all.push(idx);
  idx += 3;
}
console.log('\n})( 出现:', all.length, '最后3个:', all.slice(-3).join(', '));
if (all.length) {
  const last = all[all.length - 1];
  console.log('\n=== 最后入口调用上下文 ===');
  console.log(code.substring(Math.max(0, last - 100), Math.min(code.length, last + 400)));
}
