/**
 * 196_opcode_sem.js
 *
 * dump 操作码语义（xj 94 个）+ 分析 nx dynCode 主 dispatcher 的操作码分支
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');

(async () => {
  const sem = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/opcode_semantics_v3.json')));
  console.log('=== 操作码语义（xj 94 个）===');
  for (const [op, code] of Object.entries(sem)) {
    console.log(`op${op}: ${code.substring(0, 80)}`);
  }

  // 分析 nx dynCode 主 dispatcher（_$o1@669）
  const dyn = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
  const ast = parser.parse(dyn, { sourceType: 'script', allowReturnOutsideFunction: true });
  const expr = ast.program.body[0];
  const body = expr.expression.callee.body.body;
  const o1 = body[669];
  console.log('\n=== _$o1（主 dispatcher，params=' + o1.params.length + '）===');
  console.log('函数体长度:', o1.end - o1.start);
  const o1Body = o1.body.body;
  console.log('直接节点:', o1Body.length);
  o1Body.forEach((n, i) => {
    if (n.type === 'WhileStatement') {
      console.log('[' + i + '] while @' + n.start, 'len=' + (n.end - n.start));
    } else if (n.type === 'VariableDeclaration') {
      const names = n.declarations.map(d => d.id.name).join(',');
      console.log('[' + i + '] var:', names.substring(0, 100));
    } else {
      console.log('[' + i + '] ' + n.type);
    }
  });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
