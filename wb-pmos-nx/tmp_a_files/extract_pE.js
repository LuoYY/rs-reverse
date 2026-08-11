// 提取 _$pE（token 读取）、_$ls、_$f$ 等解析辅助
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
function extractFn(name) {
  let i = c.indexOf('function ' + name + '(');
  if (i < 0) return name + ': N/A';
  let depth = 0, end = -1;
  for (let j = i; j < c.length; j++) {
    if (c[j] === '{') depth++;
    else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  return c.slice(i, end + 1);
}
for (const n of ['_$pE', '_$ls', '_$f$', '_$og', '_$pu', '_$lO']) {
  console.log('=== ' + n + ' ===');
  console.log(extractFn(n).slice(0, 400));
  console.log();
}
// gS 字节码的字符表示
const states = require('./nx_md_states.json');
const gs13 = states.find(s => s.gS && s.gS.length === 13);
const gs36 = states.find(s => s.gS && s.gS.length === 36);
const gs92 = states.find(s => s.gS && s.gS.length === 92);
console.log('=== gS 字符表示 ===');
for (const [n, s] of [['13', gs13], ['36', gs36], ['92', gs92]]) {
  const chars = s.gS.map(v => {
    if (v === 32) return ' ';
    if (v === 9) return '\\t';
    if (v === 10) return '\\n';
    if (v === 13) return '\\r';
    if (v >= 32 && v < 127) return String.fromCharCode(v);
    return '\\x' + v.toString(16).padStart(2, '0');
  }).join('');
  console.log('gS' + n + ':', chars);
}
