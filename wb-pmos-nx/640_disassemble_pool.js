/**
 * 640_disassemble_pool.js
 * 反编译 _$_$ 池（用 560 号操作码表 + _$kv 源码语义）
 * _$_$[1] = 主程序 114 元素
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');

// 提取 _$kv 解释器源码（第 6 行）
const line6 = code.split('\n')[5] || '';
console.log('第 6 行 _$kv len:', line6.length);
fs.writeFileSync('/tmp/nx_kv_source.js', line6);

const pool = JSON.parse(fs.readFileSync('/tmp/nx_bytecode_pool.json', 'utf8'));
console.log('池:', pool.map((a, i) => `[${i}]=${a.length}元素`).join(' '));

// 主程序 _$_$[1] 反汇编
const main = pool[1];
console.log('\n=== _$_$[1] 主程序（114 元素）===');
console.log(main.join(','));

// 需要从 _$kv 源码提取操作码语义
// _$kv: _$_$[1] 是 _$kv 执行的 bytecode
// 读 _$kv 源码的 while(1) switch 结构
const kvSrc = line6;
// 提取 if(_$pn<101){...} 的语义（_$pn 是操作码）
// 手动分析主要操作码
console.log('\n=== 操作码分布 ===');
const counts = {};
for (const v of main) counts[v] = (counts[v] || 0) + 1;
Object.entries(counts).sort((a, b) => a[0] - b[0]).forEach(([v, c]) => console.log(`op ${v}: ${c} 次`));
