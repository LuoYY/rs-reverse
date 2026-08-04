const fs = require('fs');
const path = require('path');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
const end = code.lastIndexOf('})');
const body = code.substring(code.indexOf('{') + 1, end);
let depth = 0;
const stmts = [];
let cur = '', inStr = null;
for (let i = 0; i < body.length; i++) {
  const c = body[i];
  if (inStr) {
    cur += c;
    if (c === inStr && body[i - 1] !== '\\') inStr = null;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
  cur += c;
  if (c === '{') depth++;
  else if (c === '}') depth--;
  if (c === ';' && depth === 0) {
    const s = cur.trim();
    if (s.length > 0 && !s.startsWith('function') && !s.startsWith('var ') && !s.startsWith('let ') && !s.startsWith('const ')) {
      stmts.push(s.substring(0, 200));
    }
    cur = '';
  }
}
if (cur.trim().length > 0) stmts.push(cur.trim().substring(0, 200));
console.log('顶层语句数:', stmts.length);
stmts.forEach((s, i) => console.log(`${i}: ${s}`));
