/**
 * 105_compare_rebuilt.js
 *
 * 对比 xj 与 nx 的重建代码（rebuiltCode）IIFE body 顶层结构
 * 找出 xj 能跑（runTask 正常）而 nx 不能的根本结构差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const parser = require('@babel/parser');

async function buildCode(site) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  let nsd, cd, OUTER_JS, from;
  if (site === 'xj') {
    const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/captures/cd_keys_query_1785488187669.json')));
    nsd = cap.challenges[0].nsd; cd = cap.challenges[0].cd;
    OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
    from = 'https://pmos.xj.sgcc.com.cn:20080/';
  } else {
    const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
    nsd = sync.challenge.nsd; cd = sync.challenge.cd;
    OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
    from = 'https://pmos.nx.sgcc.com.cn:10443/';
  }
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const keynameNum = site === 'xj' ? 909 : 1151;
  const ts = { nsd, cd, from, hasDebug: false, keynameNum, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/cmp-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/cmp-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  return { nsd, cd, code: coder.code, coder };
}

function analyze(code) {
  const ast = parser.parse(code, { sourceType: 'script', allowReturnOutsideFunction: true });
  const expr = ast.program.body[0];
  if (expr.type !== 'ExpressionStatement' || expr.expression.type !== 'CallExpression') {
    return { topType: expr.type, msg: '非 IIFE' };
  }
  const body = expr.expression.callee.body.body;
  const counts = { func: 0, var: 0, while: 0, other: 0 };
  const varStmts = [];
  const others = [];
  body.forEach(n => {
    if (n.type === 'FunctionDeclaration') counts.func++;
    else if (n.type === 'VariableDeclaration') { counts.var++; varStmts.push(n); }
    else if (n.type === 'WhileStatement') counts.while++;
    else { counts.other++; others.push(n.type); }
  });
  // var 声明中是否有初始化
  let initVars = [], plainVars = [];
  varStmts.forEach(v => v.declarations.forEach(d => {
    if (d.init) initVars.push(d.id.name + '=init');
    else plainVars.push(d.id.name);
  }));
  return {
    bodyLen: body.length,
    counts,
    others,
    varStmts: varStmts.length,
    initVars: initVars.slice(0, 8),
    plainVarsCount: plainVars.length,
    plainVars: plainVars.slice(0, 15),
  };
}

(async () => {
  for (const site of ['xj', 'nx']) {
    console.log(`\n===== ${site} =====`);
    const { nsd, code, coder } = await buildCode(site);
    console.log('nsd:', nsd, 'code len:', code.length);
    const info = analyze(code);
    console.log('IIFE body:', JSON.stringify(info.counts), 'var 语句:', info.varStmts, '其他:', info.others.join(','));
    console.log('初始化 var 样例:', info.initVars.join(', '));
    console.log('纯声明 var 数量:', info.plainVarsCount, '样例:', info.plainVars.join(', '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
