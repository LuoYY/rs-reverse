/**
 * 636_parse_pool.js
 * 正确解析 _$_$ 池（嵌套 [[...],[...]]）+ 反编译各子程序
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');

// 调用参数（从 635 号逻辑）
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
console.log('_$_$ 原始:', rest.substring(0, 120));
console.log('_$_$ 长度:', rest.length);

// 解析 [[...],[...],...]（嵌套数组池）
const arrs = [];
let i = 0;
while (i < rest.length) {
  const ch = rest[i];
  if (ch === '[') {
    let d = 0, j = i; inStr = null;
    for (; j < rest.length; j++) {
      const c = rest[j];
      if (inStr) { if (c === inStr && rest[j - 1] !== '\\') inStr = null; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === '[') d++;
      else if (c === ']') { d--; if (d === 0) break; }
    }
    const raw = rest.substring(i, j + 1);
    try { const p = JSON.parse(raw); if (Array.isArray(p)) arrs.push(p); }
    catch (e) {
      try { const p = JSON.parse(raw.replace(/undefined/g, '0')); if (Array.isArray(p)) arrs.push(p); }
      catch (e2) { console.log('解析失败 @', i, e2.message.substring(0, 40)); }
    }
    i = j + 1;
  } else { i++; }
}
console.log('池数:', arrs.length);
arrs.forEach((a, idx) => {
  if (a.length > 0 && typeof a[0] === 'number') {
    console.log(`_$_$[${idx}]: len=${a.length} 头=${a.slice(0, 12).join(',')}`);
  } else if (Array.isArray(a)) {
    console.log(`_$_$[${idx}]: len=${a.length} 首=${JSON.stringify(a[0]).substring(0, 40)}`);
  }
});
fs.writeFileSync('/tmp/nx_bytecode_pool.json', JSON.stringify(arrs));
console.log('已保存 /tmp/nx_bytecode_pool.json');

// 分析各池（bytecode 特征：数字操作码）
for (let idx = 0; idx < arrs.length; idx++) {
  const a = arrs[idx];
  if (!a.length || typeof a[0] !== 'number') continue;
  // 统计值分布
  const counts = {};
  for (const v of a) counts[v] = (counts[v] || 0) + 1;
  const sorted = Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, 8);
  console.log(`\n池[${idx}] 值分布: ${sorted.map(([v, c]) => `${v}x${c}`).join(' ')}`);
}
