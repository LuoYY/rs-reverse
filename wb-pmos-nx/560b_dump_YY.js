/** 560b 查看 _$$Y dispatcher 原始结构 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
// _$$Y 字面
const re = /function\s+(_\$\$Y)\s*\(([^)]*)\)\s*\{/;
const m = re.exec(code);
if (!m) { console.log('未找到 _$$Y，列出所有 4 参函数'); 
  const re2 = /function\s+(_\$[A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*\{/g;
  let mm;
  const cands = [];
  while ((mm = re2.exec(code)) !== null) {
    const params = mm[2].split(',').map(s => s.trim()).filter(Boolean);
    if (params.length === 4) cands.push({ name: mm[1], idx: mm.index });
  }
  console.log('4 参函数:', cands.map(c => c.name + '@' + c.idx).join(' | '));
  process.exit(0);
}
console.log('找到 _$$Y @', m.index, 'params:', m[2]);
const start = m.index + m[0].length - 1;
let i = start, stack = 0;
for (; i < code.length; i++) {
  if (code[i] === '{') stack++;
  else if (code[i] === '}') { stack--; if (stack === 0) break; }
}
const body = code.substring(start, i + 1);
console.log('函数体长度:', body.length);
console.log('=== 前 2000 字符 ===');
console.log(body.substring(0, 2000));
fs.writeFileSync('/tmp/nx_disp_YY.js', body);
