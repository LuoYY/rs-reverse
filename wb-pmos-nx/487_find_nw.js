/** 487 找 _$nw 来源（环境对象） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_iter_code.js', 'utf8');
console.log('=== _$nw 赋值（前 10）===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('_$nw=', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 60).replace(/\n/g, ' ')}`);
  idx += 5;
  if (cnt > 10) break;
}
// _$nw 作为参数
console.log('\n=== _$nw 在参数 ===');
const pm = code.match(/function\s+([_$\w]+)\([^)]*_\$nw[^)]*\)/);
if (pm) console.log('函数:', pm[1], ':', pm[0].substring(0, 100));
// op5 上下文（_$nw[_$gE[22]]）
const op5 = code.indexOf('_$nw[_$gE[22]]');
if (op5 >= 0) {
  console.log('\n=== _$nw[_$gE[22]] 上下文 ===');
  console.log(code.substring(op5 - 100, op5 + 80));
  // 找 _$gE[22] 的值（属性名）
  console.log('\n=== _$gE 数组定义 ===');
  const gE = code.indexOf('_$gE=[');
  if (gE >= 0) {
    // 提取数组元素
    let i = gE + 5, depth = 0, s = '';
    for (; i < code.length; i++) {
      if (code[i] === '[') depth++;
      else if (code[i] === ']') { depth--; if (depth === 0) { s += code[i]; break; } }
      if (depth > 0) s += code[i];
    }
    const elems = [];
    const re = /'([^']*)'/g;
    let m;
    while ((m = re.exec(s)) !== null) elems.push(m[1]);
    console.log('元素数:', elems.length, '[22]:', elems[22], '[111]:', elems[111]);
  } else {
    console.log('无 _$gE=[ 定义');
  }
}
