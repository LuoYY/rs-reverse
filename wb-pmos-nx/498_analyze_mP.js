/** 498 分析 jsdom 动态代码的 _$mP[_$dl] 模式（环境方法调用） */
const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/captures/jsdom_dyn_1785670108351.js', 'utf8');
console.log('dyn len:', code.length);

// 找 _$mP 定义
console.log('=== _$mP 赋值（前 8）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$mP=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 50), idx + 60).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 8) break;
}

// 找 _$mP[_$dl] 调用
console.log('\n=== _$mP[_$dl] 调用（前 6）===');
idx = 0; cnt = 0;
while ((idx = code.indexOf('_$mP[_$dl]', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ')}`);
  idx += 9;
  if (cnt > 6) break;
}

// _$mP 作为参数
console.log('\n=== _$mP 在函数参数 ===');
const pm = code.match(/function\s+([_$\w]+)\([^)]*_\$mP[^)]*\)/);
if (pm) console.log('函数:', pm[1], ':', pm[0].substring(0, 120));

// 找 _$mP = window/document 赋值
console.log('\n=== _$mP 可能 = window/document ===');
for (const kw of ['_$mP=window', '_$mP=document', '_$mP=navigator', '_$mP=this']) {
  if (code.includes(kw)) console.log('找到:', kw);
}
