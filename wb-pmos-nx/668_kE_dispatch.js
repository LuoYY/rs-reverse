/**
 * 668_kE_dispatch.js
 * 分析 _$kE 的操作码分发结构（_$f3 范围比较 + 具体操作码）
 */
const fs = require('fs');

const kE = fs.readFileSync('/tmp/nx_dyn__$kE.js', 'utf8');
const body = fs.readFileSync('/tmp/nx_kE_while.js', 'utf8');
console.log('while 体长:', body.length);

// 1. 找 _$f3===N 或 _$f3==N 出现
const eqRe = /_\$f3={2,3}(\d+)/g;
let m;
const eqOps = [];
while ((m = eqRe.exec(body)) !== null) eqOps.push(+m[1]);
console.log('_$f3===N 出现:', eqOps.length);
console.log('操作码:', [...new Set(eqOps)].sort((a, b) => a - b).join(','));

// 2. 找 _$f3<N 范围
const ltRe = /_\$f3<(\d+)/g;
const ltOps = [];
while ((m = ltRe.exec(body)) !== null) ltOps.push(+m[1]);
console.log('_$f3<N 范围标记:', ltOps.join(','));

// 3. 找操作码处理（_$f3===N){handler} 或 switch case
const handlers = {};
const re2 = /_\$f3={2,3}(\d+)\)\{/g;
while ((m = re2.exec(body)) !== null) {
  const op = +m[1];
  let st = 0, hEnd = -1;
  for (let j = m.index + m[0].length - 1; j < body.length; j++) {
    if (body[j] === '{') st++;
    else if (body[j] === '}') { st--; if (st === 0) { hEnd = j; break; } }
  }
  handlers[op] = body.substring(m.index + m[0].length, hEnd).trim().substring(0, 150);
}
console.log('\n操作码 handlers:', Object.keys(handlers).length);
Object.keys(handlers).map(Number).sort((a, b) => a - b).forEach(op => {
  console.log(`op${op}: ${handlers[op]}`);
});

// 4. 找 _$$p 填充 / basearr 相关
for (const kw of ['_$$p', 'getTime', 'Date', 'execScript']) {
  const idx = body.indexOf(kw);
  console.log(`\nwhile 体 "${kw}": ${idx >= 0 ? '@' + idx : '无'}`);
  if (idx > 0) console.log('  上下文:', body.substring(Math.max(0, idx - 80), idx + 80));
}
