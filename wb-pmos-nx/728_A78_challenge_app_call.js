const fs = require('fs');
const ch = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js', 'utf8');
// 挑战 js 尾部：调用 eval 出的 dynCode 的函数（_$bX 或 dispatcher）
console.log('挑战 js len:', ch.length);
console.log('=== 挑战 js tail 500 ===');
console.log(ch.substring(ch.length - 500));
// 挑战 js 里 $_ts 相关的启动代码
let idx = ch.indexOf('_$bX');
console.log('\n_$bX @', idx);
if (idx >= 0) console.log(ch.substring(Math.max(0, idx - 100), idx + 300));
