/**
 * 108_xj_taskarr.js
 *
 * 跑 xj 管线（离线）到 parser.init（DEBUG_RUNTASK 输出 U14124020 taskarr）
 * 对比 nx 的 taskarr 开头差异（xj 能跑，nx 不能）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

(async () => {
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-dsv4flash/captures/cd_keys_query_1785488187669.json')));
  const { nsd, cd } = cap.challenges[0];
  const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  console.log('xj nsd:', nsd, 'cp3:', r.cp3);
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/xj-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/xj-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  coder.run();
  gv._setAttr('rebuiltCode', coder.code);
  try {
    require('@src/handler/parser').init(coder);
  } catch (e) {
    console.log('parser.init 错误:', e.message.substring(0, 120));
  }
  const tasks = gv.r2mka('U14124020');
  if (tasks && tasks[0]) console.log('xj U14124020 taskarr 前 20:', JSON.stringify((tasks[0].taskarr || []).slice(0, 20)));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
