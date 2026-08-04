const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 用简单 tokenizer：只统计 IIFE 顶层（深度0）的分号语句
// IIFE 体: (function(_$l9,_$_s){ BODY })($_ts.scj,$_ts.aebi)
const end = code.lastIndexOf('})');
const startBrace = code.indexOf('{');
const body = code.substring(startBrace + 1, end);
let depth = 0;
const stmts = [];
let cur = '', inStr = null, inRegex = false;
for (let i = 0; i < body.length; i++) {
  const c = body[i];
  const prev = body[i - 1];
  if (inStr) {
    cur += c;
    if (c === inStr && prev !== '\\') inStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
  // 忽略注释
  if (c === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i++; cur += '//'; continue; }
  cur += c;
  if (c === '{') depth++;
  else if (c === '}') depth--;
  if (c === ';' && depth === 0) {
    const s = cur.trim();
    if (s.length > 0 && !s.startsWith('function')) {
      stmts.push({ pos: startBrace + 1 + (i - cur.length + 1), text: s.substring(0, 300) });
    }
    cur = '';
  }
}
if (cur.trim().length > 0) stmts.push({ pos: -1, text: cur.trim().substring(0, 300) });
console.log('顶层语句数:', stmts.length);
stmts.forEach((s, i) => console.log(`${i} [@${s.pos}]: ${s.text}`));
