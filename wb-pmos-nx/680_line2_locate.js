/**
 * 680_line2_locate.js
 * 计算 dynCode 第 2 行的起始偏移，定位调用栈 @111270/@107351 的真实位置
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_cur.js', 'utf8');
console.log('dynCode len:', code.length);

// 分行
const lines = code.split('\n');
console.log('行数:', lines.length);
lines.slice(0, 5).forEach((l, i) => console.log(`行${i + 1}: len=${l.length} 头=${l.substring(0, 80)}`));

// 第 2 行起始偏移
let off = 0;
for (let i = 0; i < 1; i++) off += lines[i].length + 1; // 第 1 行 + \n
console.log('\n第 2 行起始偏移:', off);

// 调用栈位置
const pos2 = off + 111270; // _$_K @111270（第 2 行）
const pos1 = off + 107351; // _$$a @107351
console.log('_$_K 真实位置:', pos2);
console.log('_$$a 真实位置:', pos1);

console.log('\n=== _$_K（basearr push）位置 前后 1200 ===');
console.log(code.substring(pos2 - 600, pos2 + 600));

// 找 _$_K 函数定义（在真实位置附近）
const kIdx = code.lastIndexOf('function _$_K', pos2);
console.log('\nfunction _$_K @', kIdx);
if (kIdx > 0) {
  const openBrace = code.indexOf('{', kIdx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < Math.min(openBrace + 200000, code.length); i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('_$_K 定义 len:', end - kIdx);
  console.log(code.substring(kIdx, Math.min(end + 1, kIdx + 3000)));
  fs.writeFileSync('/tmp/nx_build_K_real.js', code.substring(kIdx, end + 1));
}
