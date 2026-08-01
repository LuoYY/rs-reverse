/**
 * 110_eval_body_test.js
 *
 * 决定性测试：提供 scj/aebi 后 eval 完整 IIFE body（strip 顶层 return）
 * 看 dispatcher 是否完整执行（V8 卡 or 完成）→ 操作码环境 + keys 是否生成
 *
 * 用法：node 110_eval_body_test.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const { nsd, cd } = sync.challenge;
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: 'https://pmos.nx.sgcc.com.cn:10443/', hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/110-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/110-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  const rebuilt = coder.code;
  console.log('rebuilt len:', rebuilt.length);
  console.log('$_ts.scj 类型:', typeof coder.$_ts.scj, '长度:', coder.$_ts.scj ? coder.$_ts.scj.length : 'N/A');
  console.log('$_ts.aebi 类型:', typeof coder.$_ts.aebi, '数组长度:', Array.isArray(coder.$_ts.aebi) ? coder.$_ts.aebi.length : 'N/A');
  const scj = coder.$_ts.scj;
  const aebi = coder.$_ts.aebi;

  // Babel strip 顶层 return
  const parser = require('@babel/parser');
  const traverse = require('@babel/traverse').default;
  const generate = require('@babel/generator').default;
  const bodyStart = rebuilt.indexOf('{');
  const bodyEnd = rebuilt.lastIndexOf('})(');
  const body = rebuilt.substring(bodyStart + 1, bodyEnd);
  const ast = parser.parse(body, { sourceType: 'script', allowReturnOutsideFunction: true });
  let removed = 0;
  traverse(ast, { ReturnStatement(p) { if (!p.findParent(pp => pp.isFunction())) { removed++; p.remove(); } } });
  const stripped = generate(ast, { compact: false }).code;
  console.log('strip 顶层 return:', removed, '个, stripped len:', stripped.length);

  // eval with scj/aebi（用 Function 构造器传参）
  console.log('开始 eval（带 scj/aebi）...');
  const t0 = Date.now();
  try {
    const fn = new Function('_$mw', '_$_Q', stripped);
    const ret = fn(scj, aebi);
    console.log('eval 完成', Date.now() - t0, 'ms', 'ret:', typeof ret);
  } catch (e) {
    console.log('eval 错误:', e.message.substring(0, 100), Date.now() - t0, 'ms');
    process.exit(0);
  }
  // 检查 window/cookie 状态
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
