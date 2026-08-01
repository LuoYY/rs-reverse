/**
 * 193_vm_dispatcher.js
 *
 * 分析 nx dynCode 的 dispatcher 结构：找所有 while(1) 循环 + 操作码 if 树
 * 用操作码语义（xj 94 个）映射操作码数字 → 理解外层加密流程
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');

(async () => {
  // dynCode
  const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const outer = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
  const r = runOuterVM({ nsd: sync.challenge.nsd, cd: sync.challenge.cd }, outer);
  const dyn = r.dynCode;
  fs.writeFileSync('/tmp/nx_dyn_full.js', dyn);
  console.log('dynCode len:', dyn.length);

  // 操作码语义（xj）
  const sem = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/opcode_semantics_v3.json')));

  const ast = parser.parse(dyn, { sourceType: 'script', allowReturnOutsideFunction: true });
  const expr = ast.program.body[0];
  const body = expr.expression.callee.body.body;
  console.log('IIFE body 节点:', body.length);

  // 找含 while 的函数（dispatcher）
  const dispatchers = [];
  body.forEach((n, i) => {
    if (n.type !== 'FunctionDeclaration') return;
    let hasWhile = false, whileInfo = null;
    (function chk(n2) {
      if (!n2 || typeof n2 !== 'object') return;
      if (n2.type === 'WhileStatement') {
        hasWhile = true;
        whileInfo = { start: n2.start, end: n2.end, len: n2.end - n2.start };
      }
      for (const k of Object.keys(n2)) { const v = n2[k]; if (Array.isArray(v)) v.forEach(chk); else if (v && typeof v.type === 'string') chk(v); }
    })(n);
    if (hasWhile) dispatchers.push({ i, name: n.id.name, params: n.params.length, whileLen: whileInfo.len });
  });
  console.log('\ndispatcher 函数:', dispatchers.length);
  dispatchers.forEach(d => console.log('  [' + d.i + '] ' + d.name, 'params=' + d.params, 'whileLen=' + d.whileLen));

  // 主 dispatcher（最大 while）——分析操作码
  const main = dispatchers.sort((a, b) => b.whileLen - a.whileLen)[0];
  console.log('\n主 dispatcher:', main.name, 'whileLen:', main.whileLen);

  // 提取 while 体里的操作码分支（if(_$x===N){...}）
  const whileCode = dyn.substring(main.whileStart || 0, main.whileEnd || 0);
  // 重新找 while 代码
  const wStart = dyn.indexOf('while(1)', 0);
  // 打印 while 开头
  console.log('\nwhile 开头 300:', JSON.stringify(dyn.substring(wStart, wStart + 300)));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
