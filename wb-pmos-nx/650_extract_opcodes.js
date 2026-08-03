/**
 * 650_extract_opcodes.js
 * 提取外层 VM _$kv 主循环操作码语义（_$pn=_$eL[_$mJ++];if(_$pn<101){...}）
 * 反编译 _$_$[1]（114 元素 bytecode）理解 basearr 生成
 */
const fs = require('fs');

const kvSrc = fs.readFileSync('/tmp/nx_kv_source.js', 'utf8');
console.log('_$kv 源码 len:', kvSrc.length);

// 主循环特征：_$pn=_$eL[_$mJ++]
const idx = kvSrc.indexOf('_$pn=_$eL[_$mJ++]');
console.log('主循环位置:', idx);
if (idx < 0) { process.exit(1); }
// 提取 while(1){...}
const whileStart = kvSrc.lastIndexOf('while(1){', idx);
console.log('while(1) 位置:', whileStart);
const bodyStart = kvSrc.indexOf('{', whileStart);
let stack = 0, bodyEnd = -1;
for (let i = bodyStart; i < kvSrc.length; i++) {
  if (kvSrc[i] === '{') stack++;
  else if (kvSrc[i] === '}') { stack--; if (stack === 0) { bodyEnd = i; break; } }
}
const whileBody = kvSrc.substring(bodyStart + 1, bodyEnd);
console.log('while 体长度:', whileBody.length);
fs.writeFileSync('/tmp/nx_kv_main_while.js', whileBody);

// 解析操作码：_$pn===N){...}
const handlers = {};
const re = /_\$pn===(\d+)\)\{/g;
let m;
while ((m = re.exec(whileBody)) !== null) {
  const op = +m[1];
  let st = 0, end = -1;
  for (let j = m.index + m[0].length - 1; j < whileBody.length; j++) {
    if (whileBody[j] === '{') st++;
    else if (whileBody[j] === '}') { st--; if (st === 0) { end = j; break; } }
  }
  handlers[op] = whileBody.substring(m.index + m[0].length, end).trim();
}
console.log('操作码数:', Object.keys(handlers).length);
const sortedOps = Object.keys(handlers).map(Number).sort((a, b) => a - b);
console.log('操作码范围:', Math.min(...sortedOps), '-', Math.max(...sortedOps));
// 操作码列表
console.log('操作码:', sortedOps.join(','));

// 输出关键操作码语义（前 20）
for (const op of sortedOps.slice(0, 20)) {
  console.log(`\nop${op}: ${handlers[op].substring(0, 200)}`);
}
fs.writeFileSync('/tmp/nx_kv_opcode_handlers.json', JSON.stringify(handlers, null, 1));
console.log('\n已保存 /tmp/nx_kv_opcode_handlers.json');
