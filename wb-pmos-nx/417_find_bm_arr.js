/**
 * 417_find_bm_arr.js
 * 搜 _$bm 的所有出现（定义/使用）→ 解码属性名数组
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 所有 _$bm 出现
let idx = 0, count = 0;
while ((idx = code.indexOf('_$bm', idx)) !== -1) {
  count++;
  const ctx = code.substring(Math.max(0, idx - 60), idx + 80).replace(/\n/g, ' ');
  console.log(`#${count} @${idx}: ${ctx}`);
  idx += 4;
  if (count > 12) break;
}
console.log('\n_$bm 总数(前12):', count);

// 找 _$bm 定义（= [ 或 var）
const defIdx = code.indexOf('_$bm=[');
if (defIdx < 0) {
  // 尝试 _$bm = 
  const m = code.match(/_\$bm\s*=\s*\[/);
  if (m) console.log('\n_$bm=[ 定义 @', m.index);
} else {
  console.log('\n_$bm=[ 定义 @', defIdx);
}
