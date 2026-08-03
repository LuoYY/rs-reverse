/**
 * 637_parse_pool2.js
 * 去尾逗号解析 _$_$ 池
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');

const start = code.indexOf('(function(_$dX,_$_$){');
let brace = code.indexOf('{', start);
let depth = 0, inStr = null, fnEnd = -1;
for (let i = brace; i < code.length; i++) {
  const ch = code[i];
  if (inStr) { if (ch === inStr && code[i - 1] !== '\\') inStr = null; continue; }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { fnEnd = i; break; } }
}
const openParen = code.indexOf('(', fnEnd + 1);
depth = 0; inStr = null;
let callEnd = -1;
for (let i = openParen; i < code.length; i++) {
  const ch = code[i];
  if (inStr) { if (ch === inStr && code[i - 1] !== '\\') inStr = null; continue; }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
  if (ch === '(') depth++;
  else if (ch === ')') { depth--; if (depth === 0) { callEnd = i; break; } }
}
const callBody = code.substring(openParen + 1, callEnd);
const firstComma = callBody.indexOf(',');
const rest = callBody.substring(firstComma + 1);

// 去尾逗号（,] 或 ,})
function stripTrailingCommas(s) {
  return s.replace(/,\s*([\]}])/g, '$1');
}

const cleaned = stripTrailingCommas(rest);
const arrs = [];
let i = 0;
while (i < cleaned.length) {
  const ch = cleaned[i];
  if (ch === '[') {
    let d = 0, j = i; inStr = null;
    for (; j < cleaned.length; j++) {
      const c = cleaned[j];
      if (inStr) { if (c === inStr && cleaned[j - 1] !== '\\') inStr = null; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === '[') d++;
      else if (c === ']') { d--; if (d === 0) break; }
    }
    const raw = cleaned.substring(i, j + 1);
    try {
      const p = JSON.parse(stripTrailingCommas(raw));
      if (Array.isArray(p)) arrs.push(p);
    } catch (e) { console.log('解析失败 @', i, e.message.substring(0, 50)); }
    i = j + 1;
  } else { i++; }
}
console.log('池数:', arrs.length);
arrs.forEach((a, idx) => {
  if (a.length > 0 && typeof a[0] === 'number') {
    console.log(`_$_$[${idx}]: len=${a.length} 头=${a.slice(0, 15).join(',')}`);
  } else {
    console.log(`_$_$[${idx}]: len=${a.length} 类型=${typeof a[0]}`);
  }
});
fs.writeFileSync('/tmp/nx_bytecode_pool.json', JSON.stringify(arrs));
console.log('已保存 /tmp/nx_bytecode_pool.json');
