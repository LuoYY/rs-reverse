// Extract main dispatcher opcode handlers from the local formatted outer js.
const fs = require('fs');
const code = fs.readFileSync('example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js', 'utf8');

// String-aware brace matcher: find matching close brace from openBraceIdx, skipping string/regex literals.
function matchBrace(src, openIdx) {
  let depth = 0, inStr = false, strCh = null, esc = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === strCh) inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const fetchIdx = code.indexOf('_$kj = _$_u[_$_w++];');
const whileIdx = code.lastIndexOf('while (1)', fetchIdx);
let bstart = code.indexOf('{', whileIdx);
const end = matchBrace(code, bstart);
const body = code.substring(bstart, end);
console.log('main dispatcher: while@' + whileIdx + '..' + end + ' (len ' + (end - whileIdx) + ')');

// Extract handler bodies for each _$kj === N
const re = /_\$kj\s*===\s*(\d+)\)\s*\{/g;
let m, handlers = [];
while ((m = re.exec(body)) !== null) {
  const op = +m[1];
  const bodyStart = m.index + m[0].length - 1;
  const be = matchBrace(body, bodyStart);
  if (be < 0) continue;
  handlers.push({ op, body: body.substring(bodyStart + 1, be).trim() });
}
console.log('total handlers:', handlers.length);
const maxOp = Math.max(...handlers.map(h => h.op));
console.log('op range: 0..' + maxOp);

// Classify: which opcodes touch arrays (push/concat/length/index-assign/encryption)
const arrOps = handlers.filter(h => /\.push\(|\.concat\(|\.length|new\s|_\$dI|encrypt|Array/i.test(h.body));
console.log('\n=== array/crypto-touching opcodes ===');
arrOps.forEach(h => {
  console.log('[op ' + h.op + '] ' + h.body.substring(0, 170).replace(/\n/g, ' ').replace(/\s+/g, ' '));
});
// Also dump ALL opcodes 32+ briefly (their first statement)
console.log('\n=== all opcodes >= 32 (first stmt) ===');
handlers.filter(h => h.op >= 32).forEach(h => {
  console.log('[op ' + h.op + '] ' + h.body.substring(0, 140).replace(/\n/g, ' ').replace(/\s+/g, ' '));
});

