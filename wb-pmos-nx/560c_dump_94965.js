/** 560c 查看 @94965 附近 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
const pos = 94965;
console.log('=== @94965 前后 300 ===');
console.log(code.substring(pos - 300, pos + 120));
// 从 @94965 往后找函数体
const start = pos;
let i = start, stack = 0;
let found = false;
for (; i < code.length; i++) {
  if (code[i] === '{') { stack++; found = true; }
  else if (code[i] === '}') { stack--; if (stack === 0 && found) break; }
}
const body = code.substring(start, i + 1);
console.log('\n函数体长度:', body.length);
console.log('=== 前 1500 ===');
console.log(body.substring(0, 1500));
fs.writeFileSync('/tmp/nx_disp_YY.js', body);
