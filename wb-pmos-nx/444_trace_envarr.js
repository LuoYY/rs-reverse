/** 444 追踪环境数组 _kH 的传递链 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
console.log('len:', code.length);

// 1. 报错位置 168636 附近——找函数定义头
const pos = 168636;
console.log('=== 报错函数头（往前 800）===');
console.log(code.substring(pos - 800, pos + 100));

// 2. 找 _$kH 的所有出现
console.log('\n=== _$kH 出现（前 10）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$kH', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 70), idx + 40).replace(/\n/g, ' ')}`);
  idx += 4;
  if (cnt >= 10) break;
}
console.log('_$kH 出现数(前10):', cnt);

// 3. 找 dispatcher 函数定义（报错函数）
// 报错在 while(1){window.__w3 前，往前找最近的 function
const w3 = code.indexOf('window.__w3', pos);
console.log('\n=== __w3 插桩位置 ===');
let wIdx = 0, wCnt = 0;
while ((wIdx = code.indexOf('window.__w3=', wIdx)) !== -1) {
  wCnt++;
  if (Math.abs(wIdx - pos) < 5000) {
    console.log(`@${wIdx}: ${code.substring(Math.max(0, wIdx - 600), wIdx).substring(-400)}`);
  }
  wIdx += 12;
  if (wCnt > 10) break;
}
