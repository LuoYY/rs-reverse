/** 486 看 dispatcher #7 的 _$pS 构造 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
const pos = 518379;
console.log('=== @518379 前后 2500 ===');
console.log(code.substring(pos - 500, pos + 2500));
// 找 _$pS= 赋值（在 dispatcher #7 区域）
console.log('\n=== 该区域 _$pS= ===');
const seg = code.substring(pos - 500, pos + 6000);
let idx = 0, cnt = 0;
while ((idx = seg.indexOf('_$pS=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt}: ${seg.substring(Math.max(0, idx - 40), idx + 60)}`);
  idx += 5;
  if (cnt > 8) break;
}
