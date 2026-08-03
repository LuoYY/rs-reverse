/** 452 分析 opcode 720 报错点 + _$gd/_$hw 来源 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

const pos = 346514;
console.log('=== 报错 346514 前后 400 ===');
console.log(code.substring(pos - 400, pos + 100));

// 找 _$gd 赋值（往前）
console.log('\n=== _$gd 赋值（报错前 5000 内）===');
const seg = code.substring(Math.max(0, pos - 5000), pos);
let idx = 0, cnt = 0;
while ((idx = seg.indexOf('_$gd=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt}: ${seg.substring(Math.max(0, idx - 40), idx + 60).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 6) break;
}

// 找 _$hw 定义/赋值
console.log('\n=== _$hw 出现（前 6）===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('_$hw', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 50), idx + 40).replace(/\n/g, ' ')}`);
  idx += 4;
  if (cnt > 6) break;
}
