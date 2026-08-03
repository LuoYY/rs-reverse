/** 494 分析 dispatcher #3（环境初始化）环境数组构造 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
// dispatcher #3 入口（_$m6=_$kn 特征）
const pos = code.indexOf('_$m6=_$kn');
console.log('dispatcher #3 @', pos);
if (pos >= 0) {
  console.log('=== 前后 2000 ===');
  console.log(code.substring(pos - 300, pos + 2000));
}
