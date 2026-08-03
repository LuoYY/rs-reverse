/**
 * 652_disasm_full.js
 * 从 _$kv 源码提取全部操作码 handler + 反编译 _$_$[1]（114 元素）
 */
const fs = require('fs');

const kvSrc = fs.readFileSync('/tmp/nx_kv_source.js', 'utf8');
const pool = JSON.parse(fs.readFileSync('/tmp/nx_bytecode_pool.json', 'utf8'));
const main = pool[1];

// 提取全部操作码 handler（从整个 kvSrc）
const handlers = {};
const re = /_\$pn===(\d+)\)\{/g;
let m;
while ((m = re.exec(kvSrc)) !== null) {
  const op = +m[1];
  // 找对应的 }（括号匹配）
  let st = 0, end = -1;
  for (let j = m.index + m[0].length - 1; j < kvSrc.length; j++) {
    if (kvSrc[j] === '{') st++;
    else if (kvSrc[j] === '}') { st--; if (st === 0) { end = j; break; } }
  }
  handlers[op] = kvSrc.substring(m.index + m[0].length, end).trim();
}
console.log('操作码 handler 数:', Object.keys(handlers).length);
fs.writeFileSync('/tmp/nx_kv_opcode_handlers.json', JSON.stringify(handlers, null, 1));

// 反编译 _$_$[1]
console.log('\n=== 反编译 _$_$[1]（114 元素）===');
const out = [];
for (let i = 0; i < main.length; i++) {
  const op = main[i];
  const h = handlers[op];
  out.push(`@${i} op${op}: ${h ? h.substring(0, 120) : '???'}`);
}
console.log(out.join('\n'));
fs.writeFileSync('/tmp/nx_kv_disasm_full.txt', out.join('\n'));

// 统计操作码在 main 中
const counts = {};
for (const op of main) counts[op] = (counts[op] || 0) + 1;
console.log('\n=== main 操作码统计 ===');
Object.entries(counts).sort((a, b) => a[0] - b[0]).forEach(([op, c]) => {
  console.log(`op${op} x${c}: ${(handlers[op] || '???').substring(0, 80)}`);
});
