/** 562d 提取当前会话主 dispatcher（_$bk）和 bytecode 构造（_$dP._$cd） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 1. _$bk dispatcher 定义
let m = code.match(/function\s+_\$bk\([^)]*\)\s*\{/);
if (m) {
  const start = m.index + m[0].length - 1;
  let i = start, stack = 0;
  for (; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) break; }
  }
  const body = code.substring(start, i + 1);
  console.log('_$bk dispatcher len:', body.length);
  fs.writeFileSync('/tmp/nx_disp_bk.js', body);
  console.log('=== 前 800 ===');
  console.log(body.substring(0, 800));
}

// 2. _$dP._$cd 构造点
console.log('\n=== ._$cd 相关 ===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('._$cd', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 120), idx + 80).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 5) break;
}
