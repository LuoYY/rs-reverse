/**
 * 635_extract_call.js
 * 用括号匹配正确提取外层 JS 末尾 IIFE 调用参数（_$_$ bytecode 池）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const code = fs.readFileSync(OUTER_JS, 'utf8');

// 入口函数定义位置
const start = code.indexOf('(function(_$dX,_$_$){');
console.log('入口起始:', start);
// 括号匹配：从入口的 { 开始
let brace = code.indexOf('{', start);
let depth = 0, inStr = null;
let fnEnd = -1;
for (let i = brace; i < code.length; i++) {
  const ch = code[i];
  if (inStr) { if (ch === inStr && code[i - 1] !== '\\') inStr = null; continue; }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
  if (ch === '{') depth++;
  else if (ch === '}') { depth--; if (depth === 0) { fnEnd = i; break; } }
}
console.log('函数体结束:', fnEnd);
// 调用参数：}(...);
const afterFn = code.substring(fnEnd + 1, fnEnd + 20);
console.log('函数体后:', afterFn);
// 提取调用括号内容
const openParen = code.indexOf('(', fnEnd + 1);
if (openParen < 0) { console.log('调用未找到'); process.exit(1); }
depth = 0; inStr = null;
let callEnd = -1;
for (let i = openParen; i < code.length; i++) {
  const ch = code[i];
  if (inStr) { if (ch === inStr && code[i - 1] !== '\\') inStr = null; continue; }
  if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
  if (ch === '(') depth++;
  else if (ch === ')') { depth--; if (depth === 0) { callEnd = i; break; } }
}
console.log('调用结束:', callEnd);
const callBody = code.substring(openParen + 1, callEnd);
console.log('调用参数长度:', callBody.length);
fs.writeFileSync('/tmp/nx_outer_call_body.js', callBody);

// 解析顶层数组（精确）
function parseTopArrays(s) {
  const arrs = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '[') {
      let depth = 0, j = i; inStr = null;
      for (; j < s.length; j++) {
        const c = s[j];
        if (inStr) { if (c === inStr && s[j - 1] !== '\\') inStr = null; continue; }
        if (c === '"' || c === "'") { inStr = c; continue; }
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) break; }
      }
      const raw = s.substring(i, j + 1);
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arrs.push(parsed);
      } catch (e) {
        try {
          const cleaned = raw.replace(/undefined/g, '0');
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) arrs.push(parsed);
        } catch (e2) { console.log('解析失败 @', i, e2.message.substring(0, 30)); }
      }
      i = j + 1;
    } else { i++; }
  }
  return arrs;
}

// 第一个参数（_$dX）可能是标量或数组
const firstComma = callBody.indexOf(',');
const firstArg = callBody.substring(0, firstComma).trim();
console.log('第一个参数（_$dX）:', firstArg.substring(0, 100));
const rest = callBody.substring(firstComma + 1);
const pools = parseTopArrays(rest);
console.log('_$_$ 池数:', pools.length);
pools.forEach((a, i) => {
  if (Array.isArray(a) && a.length > 0 && typeof a[0] === 'number') {
    console.log(`  _$_$[${i}]: len=${a.length} 头=${a.slice(0, 15).join(',')}`);
  } else {
    console.log(`  _$_$[${i}]: len=${a.length} 首元素=${JSON.stringify(a[0]).substring(0, 30)}`);
  }
});
fs.writeFileSync('/tmp/nx_bytecode_pool.json', JSON.stringify(pools));
console.log('已保存 bytecode 池');
