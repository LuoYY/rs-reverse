/** 448 分析 78287 位置（getFloat16 报错上下文） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
console.log('len:', code.length);

const pos = 78287;
console.log('=== 前 500 ===');
console.log(code.substring(pos - 500, pos));
console.log('\n=== 后 200 ===');
console.log(code.substring(pos, pos + 200));

// 找包含此代码的函数定义
console.log('\n=== 函数定义（往前找 function）===');
const fnIdx = code.lastIndexOf('function ', pos);
if (fnIdx >= 0) {
  console.log('function @', fnIdx, ':', code.substring(fnIdx, fnIdx + 80));
}
