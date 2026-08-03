/**
 * 641_disassemble_kv.js
 * 反编译外层 VM _$_$[1]（114 元素 bytecode）
 * 操作码语义从 _$kv 源码（/tmp/nx_kv_source.js）的 while(1) if-else 树提取
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const kvSrc = fs.readFileSync('/tmp/nx_kv_source.js', 'utf8');
const pool = JSON.parse(fs.readFileSync('/tmp/nx_bytecode_pool.json', 'utf8'));
const main = pool[1];

// 提取 _$kv 的 while(1) switch 主体（_$pn=...;if(_$pn<101){...}）
const whileStart = kvSrc.indexOf('while(1)');
const bodyStart = kvSrc.indexOf('{', whileStart);
// 括号匹配提取 while 体
let stack = 0, bodyEnd = -1;
for (let i = bodyStart; i < kvSrc.length; i++) {
  if (kvSrc[i] === '{') stack++;
  else if (kvSrc[i] === '}') { stack--; if (stack === 0) { bodyEnd = i; break; } }
}
const whileBody = kvSrc.substring(bodyStart + 1, bodyEnd);
console.log('while 体长度:', whileBody.length);
fs.writeFileSync('/tmp/nx_kv_while_body.js', whileBody);

// 解析操作码语义：_$pn<101 → 二分树
// 结构: _$pn=_$eL[_$mJ++];if(_$pn<101){...}else{...}
// 递归解析 if(_$pn<N){...} else if(_$pn<M){...} else {...}
// 但嵌套是 if(_$pn<101){if(_$pn<64){if(_$pn<16){...}}} 形式
// 用树形解析：每个 if(_$pn<N) 分支对应一个 opcode 或子范围

// 简化：正则找所有 `_$pn===N` 或 `_$pn===N){` 的处理
const handlers = {};
const re = /_\$pn===(\d+)\)\{/g;
let m;
while ((m = re.exec(whileBody)) !== null) {
  const op = +m[1];
  // 找对应的 } (匹配 {)
  let st = 0, end = -1;
  for (let j = m.index + m[0].length - 1; j < whileBody.length; j++) {
    if (whileBody[j] === '{') st++;
    else if (whileBody[j] === '}') { st--; if (st === 0) { end = j; break; } }
  }
  const handler = whileBody.substring(m.index + m[0].length, end).trim().substring(0, 300);
  handlers[op] = handler;
}
console.log('操作码数:', Object.keys(handlers).length);
const sortedOps = Object.keys(handlers).map(Number).sort((a, b) => a - b);
console.log('操作码:', sortedOps.join(','));

// 反编译主程序
console.log('\n=== 反编译 _$_$[1]（114 元素）===');
const out = [];
for (let i = 0; i < main.length; i++) {
  const op = main[i];
  const h = handlers[op];
  out.push(`@${i} op${op}: ${h ? h.substring(0, 100) : '???'}`);
}
console.log(out.join('\n'));
fs.writeFileSync('/tmp/nx_kv_disasm.txt', out.join('\n'));
fs.writeFileSync('/tmp/nx_opcode_handlers.json', JSON.stringify(handlers, null, 1));
