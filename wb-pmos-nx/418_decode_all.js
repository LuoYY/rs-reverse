/**
 * 418_decode_all.js
 * 提取动态代码所有数组定义 + 用 3 种解码（反转/隔位/4位）解码属性名 → 找 documentMode
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 提取所有数组定义：[_$\w]+=[...] 或 [_$\w]+=[...]
function extractArray(defStr) {
  // defStr 从 [_$X]= 后开始
  let i = defStr.indexOf('[');
  if (i < 0) return null;
  let depth = 0, s = '';
  for (; i < defStr.length; i++) {
    const c = defStr[i];
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { s += c; break; } }
    if (depth > 0) s += c;
  }
  return s;
}
function parseArr(arrStr) {
  const elems = [];
  const re = /'([^']*)'|([0-9]+)|\[/g;
  let m;
  while ((m = re.exec(arrStr)) !== null) {
    if (m[1] !== undefined) elems.push({ type: 's', v: m[1] });
    else if (m[2] !== undefined) elems.push({ type: 'n', v: +m[2] });
    else elems.push({ type: 'arr' });
  }
  return elems;
}
// 解码函数
const rev = s => s.split('').reverse().join('');
function swap2(s) { const a = s.split(''); for (let i = a.length - 2; i >= 0; i -= 2) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; } return a.join(''); }
function swap4(s) { const a = s.split(''); for (let i = a.length - 4; i >= 0; i -= 4) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = a[i + 3]; a[i + 3] = a[i + 2]; a[i + 2] = t; } return a.join(''); }

// 找所有数组定义
const arrays = {};
const reDef = /([_$]\w+)=\[/g;
let m;
while ((m = reDef.exec(code)) !== null) {
  const name = m[1];
  if (arrays[name]) continue;
  const arrStr = extractArray(code.substring(m.index));
  if (!arrStr) continue;
  arrays[name] = parseArr(arrStr);
}
console.log('数组总数:', Object.keys(arrays).length);
for (const [n, arr] of Object.entries(arrays)) {
  console.log(`${n}: ${arr.length} 元素, 字符串 ${arr.filter(e => e.type === 's').length}`);
}

// 解码所有字符串元素，找 documentMode 相关
console.log('\n=== 解码属性名（含 document/Element/Mode 等）===');
for (const [n, arr] of Object.entries(arrays)) {
  arr.forEach((e, idx) => {
    if (e.type !== 's') return;
    const s = e.v;
    const candidates = [s, rev(s), swap2(s), swap4(s), swap2(rev(s)), rev(swap2(s))];
    for (const c of candidates) {
      if (/^[A-Za-z0-9]+$/.test(c) && (c.includes('document') || c.includes('Mode') || c.includes('mode') || c.includes('Element') || c.includes('visibility') || c.includes('ready') || c.includes('character') || c.includes('compat'))) {
        console.log(`${n}[${idx}] '${s}' → '${c}'`);
      }
    }
  });
}
