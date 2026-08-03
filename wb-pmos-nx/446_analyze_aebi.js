/** 446 分析 $_ts.aebi / scj 来源 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// 搜 aebi 在动态代码里的出现（含定义）
console.log('=== aebi 出现 ===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('aebi', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 80), idx + 50).replace(/\n/g, ' ')}`);
  idx += 4;
  if (cnt > 6) break;
}
console.log('aebi 出现:', cnt);

console.log('\n=== scj 出现 ===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('scj', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 80), idx + 50).replace(/\n/g, ' ')}`);
  idx += 3;
  if (cnt > 6) break;
}
console.log('scj 出现:', cnt);

// 搜 $_ts 引用
console.log('\n=== $_ts 出现 ===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('$_ts', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ')}`);
  idx += 4;
  if (cnt > 8) break;
}
console.log('$_ts 出现:', cnt);
