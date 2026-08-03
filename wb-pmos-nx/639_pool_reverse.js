/**
 * 639_pool_reverse.js
 * 从末尾 ]); 反向定位调用 + 解析 _$_$ 池
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');

// 末尾调用结束：...]); 
const semi = code.lastIndexOf(');');
// 反向找调用括号（匹配 ')' 对应的 '('）
let depth = 0, inStr = null;
let openParen = -1;
for (let i = semi; i >= 0; i--) {
  const ch = code[i];
  if (inStr) { if (ch === inStr && code[i + 1] !== '\\') inStr = null; continue; }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
  if (ch === ')') depth++;
  else if (ch === '(') { depth--; if (depth === 0) { openParen = i; break; } }
}
console.log('调用括号:', openParen, '结束:', semi);
const callBody = code.substring(openParen + 1, semi);
console.log('调用参数头:', callBody.substring(0, 150));
console.log('调用参数长:', callBody.length);

// 第一个参数（_$dX）到第一个逗号
const firstComma = callBody.indexOf(',');
const rest = callBody.substring(firstComma + 1).replace(/,\s*(\])/g, '$1');
try {
  const pool = JSON.parse(rest);
  console.log('池顶层:', Array.isArray(pool) ? 'array len=' + pool.length : typeof pool);
  pool.forEach((a, i) => {
    if (Array.isArray(a) && a.length && typeof a[0] === 'number') {
      console.log(`  _$_$[${i}]: len=${a.length} 头=${a.slice(0, 15).join(',')}`);
    } else console.log(`  _$_$[${i}]: ${JSON.stringify(a).substring(0, 50)}`);
  });
  fs.writeFileSync('/tmp/nx_bytecode_pool.json', JSON.stringify(pool));
  console.log('已保存 /tmp/nx_bytecode_pool.json');
} catch (e) { console.log('解析失败:', e.message.substring(0, 60)); }
