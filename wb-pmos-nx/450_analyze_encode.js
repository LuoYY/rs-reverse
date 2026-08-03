/** 450 分析编码函数 _$i7/_$n0/_$ce + getFloat16 访问 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');

function dumpFn(name) {
  const m = code.indexOf('function ' + name + '(');
  if (m < 0) { console.log(name + ': 未找到'); return; }
  let i = code.indexOf('{', m), stack = 0, end = -1;
  for (; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  console.log('=== ' + name + ' (' + (end - m) + ' chars) ===');
  console.log(code.substring(m, end + 1).substring(0, 600));
  console.log('');
}
dumpFn('_$i7');
dumpFn('_$n0');
dumpFn('_$ce');

// 报错位置 78241 精确
const pos = 78241;
console.log('=== 报错 78241 前后 100 ===');
console.log(code.substring(pos - 100, pos + 100));

// 搜 getFloat16 字符串（属性名数组）
console.log('\n=== getFloat16 字面量 ===');
console.log('出现:', (code.match(/getFloat16/g) || []).length);
// 搜反转 edomtnuoc 类
const revs = ['16taolFteg', '61taolFteg'];
for (const r of revs) {
  if (code.includes(r)) console.log('反转找到:', r);
}
