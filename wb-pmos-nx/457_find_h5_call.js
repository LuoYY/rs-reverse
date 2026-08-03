/** 457 找 _$h5 调用（_$bl 环境数组来源） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

// _$h5( 调用
console.log('=== _$h5( 调用（前 8）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$h5(', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 80), idx + 100).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 8) break;
}
console.log('_$h5( 总数(前8):', cnt);

// 也找 _$h5 作为方法/赋值
console.log('\n=== _$h5 其他出现 ===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('_$h5', idx)) !== -1) {
  const ctx = code.substring(Math.max(0, idx - 30), idx + 30);
  if (!ctx.includes('_$h5(')) {
    cnt++;
    console.log(`#${cnt} @${idx}: ${ctx.replace(/\n/g, ' ')}`);
    if (cnt > 5) break;
  }
  idx += 4;
}
