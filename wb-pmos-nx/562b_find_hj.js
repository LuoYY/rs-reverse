/** 562b 直接搜 dynCode 中 ._$hJ= 赋值（bytecode 构造点） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
let idx = 0, cnt = 0;
console.log('=== ._$hJ= 赋值 ===');
while ((idx = code.indexOf('._$hJ=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 100), idx + 100).replace(/\n/g, ' ')}`);
  idx += 7;
  if (cnt > 6) break;
}
console.log('\n=== main VM 上下文构造（_$mg 内部 _$_7={...}）===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('._$$y=_$fw()', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 200), idx + 200).replace(/\n/g, ' ')}`);
  idx += 13;
  if (cnt > 3) break;
}
