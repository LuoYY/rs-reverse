/** 560d 找 nx dynCode 中 bytecode 数组定义（_$$Y 的 _$_7._$hJ 来源） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');

// 1. _$$Y 调用点（找 _$$Y( 的位置）
console.log('=== _$$Y( 调用点 ===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$$Y(', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 80), idx + 80).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 5) break;
}

// 2. 找 _$_7._$hJ 赋值
console.log('\n=== _$_7._$hJ= 赋值 ===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('._$hJ=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ')}`);
  idx += 7;
  if (cnt > 8) break;
}

// 3. 找 _$pk 定义
console.log('\n=== _$pk 定义/使用 ===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('_$pk', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 50), idx + 60).replace(/\n/g, ' ')}`);
  idx += 4;
  if (cnt > 10) break;
}

// 4. 找大数组字面量（bytecode 候选：元素都 ≤ 200 左右的大数组）
console.log('\n=== 大数字数组候选（500+ 元素）===');
const re = /\[([0-9]+(?:,[0-9]+){100,})\]/g;
let m; cnt = 0;
while ((m = re.exec(code)) !== null) {
  const arr = m[1].split(',').map(Number);
  const maxv = Math.max(...arr);
  const minv = Math.min(...arr);
  if (maxv <= 250 && arr.length >= 300) {
    cnt++;
    console.log(`#${cnt} len=${arr.length} max=${maxv} @${m.index}`);
    if (cnt > 10) break;
  }
}
console.log('数组候选数:', cnt);
