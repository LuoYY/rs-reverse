/** 483 分析入口函数（动态代码开头）环境数组构造 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
console.log('=== 动态代码开头 3000 ===');
console.log(code.substring(0, 3000));
