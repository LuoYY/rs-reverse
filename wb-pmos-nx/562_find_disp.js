/** 562 用 AST 定位 nx dynCode 的主 dispatcher（4 参 + bytecode 属性读取 ._$hJ） */
const fs = require('fs');
const parser = require('@babel/parser');

const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
const ast = parser.parse(code, { sourceType: 'script', allowReturnOutsideFunction: true });

// 遍历所有函数
function walk(node, depth, cb) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    cb(node, depth);
  }
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const it of v) walk(it, depth + 1, cb); }
    else if (v && typeof v === 'object') walk(v, depth + 1, cb);
  }
}

const cands = [];
walk(ast.program, 0, (fn, depth) => {
  const params = fn.params || [];
  if (params.length !== 4) return;
  const body = code.substring(fn.start, fn.end);
  // bytecode 属性读取特征：._$hJ（MemberExpression 属性名含 hJ）
  if (body.includes('._$hJ') && body.includes('for(')) {
    const name = fn.id ? fn.id.name : '(anon)';
    cands.push({ name, start: fn.start, end: fn.end, len: fn.end - fn.start, params: params.map(p => p.name || '?').join(',') });
  }
});

console.log('主 dispatcher 候选:');
cands.forEach((c, i) => console.log(`#${i}: ${c.name}(${c.params}) len=${c.len} @${c.start}`));

if (cands.length) {
  const best = cands.sort((a, b) => b.len - a.len)[0];
  console.log('\n=== 最大（主 dispatcher）===');
  console.log(best.name, 'len=' + best.len);
  const body = code.substring(best.start, best.end);
  fs.writeFileSync('/tmp/nx_disp_main.js', body);
  // 打印 bytecode 属性读取
  const re = /([_$]\w+)\._\$hJ/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    console.log('  bytecode var:', m[1], '@', m.index);
    break;
  }
}
