/**
 * 667_kE_opcodes.js
 * 提取内层 VM 核心解释器 _$kE 的操作码语义（while(1) switch）
 * 找：填充 _$$p 的操作码 + basearr 构造（[25-28] 生成）
 */
const fs = require('fs');

const kE = fs.readFileSync('/tmp/nx_dyn__$kE.js', 'utf8');
console.log('_$kE len:', kE.length);

// 找主 while(1) + 操作码判断（_$kK 或类似）
// _$kE 结构：function(_$cv,_$cr,_$l6,_$mH,_$ia){ ... while(1){ 操作码判断 } }
const opVars = ['_$kK', '_$f3', '_$k7', '_$op'];
let mainWhile = null, opVar = null;
for (const v of opVars) {
  const idx = kE.indexOf(v + '===');
  if (idx > 0) {
    // 找 while(1)
    const wIdx = kE.lastIndexOf('while(1){', idx);
    if (wIdx > 0) {
      mainWhile = wIdx;
      opVar = v;
      break;
    }
  }
}
console.log('主 while @', mainWhile, 'opVar:', opVar);

// 提取 while 体
if (mainWhile > 0) {
  const bodyStart = kE.indexOf('{', mainWhile);
  let stack = 0, end = -1;
  for (let i = bodyStart; i < kE.length; i++) {
    if (kE[i] === '{') stack++;
    else if (kE[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  const body = kE.substring(bodyStart + 1, end);
  console.log('while 体长:', body.length);
  fs.writeFileSync('/tmp/nx_kE_while.js', body);

  // 提取操作码 handlers
  const re = new RegExp(opVar + '===(\\d+)\\)\\{', 'g');
  const handlers = {};
  let m;
  while ((m = re.exec(body)) !== null) {
    const op = +m[1];
    let st = 0, hEnd = -1;
    for (let j = m.index + m[0].length - 1; j < body.length; j++) {
      if (body[j] === '{') st++;
      else if (body[j] === '}') { st--; if (st === 0) { hEnd = j; break; } }
    }
    handlers[op] = body.substring(m.index + m[0].length, hEnd).trim();
  }
  console.log('操作码数:', Object.keys(handlers).length);
  const sorted = Object.keys(handlers).map(Number).sort((a, b) => a - b);
  console.log('操作码:', sorted.join(','));

  // 找 _$$p 填充操作码
  for (const op of sorted) {
    const h = handlers[op];
    if (h.includes('_$$p')) {
      console.log(`\n★★ op${op} 含 _$$p: ${h.substring(0, 150)}`);
    }
  }
  // 输出所有操作码语义（前 30）
  for (const op of sorted.slice(0, 30)) {
    console.log(`\nop${op}: ${handlers[op].substring(0, 120)}`);
  }
  fs.writeFileSync('/tmp/nx_kE_handlers.json', JSON.stringify(handlers, null, 1));
}
