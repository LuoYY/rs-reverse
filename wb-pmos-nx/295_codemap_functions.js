/**
 * 295_codemap_functions.js
 *
 * 分析 codemap 函数表（_$ck/_$lU/_$jh 等 U14124020 依赖）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

(async () => {
  const syncFile = process.env.SYNC_FILE || fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));

  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: 'https://pmos.nx.sgcc.com.cn:10443/', hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);

  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { codemap } = coder.run();
  gv.config.codemap = codemap;

  console.log('codemap keys:', Object.keys(codemap).length);
  console.log('commonFunc len:', (codemap.commonFunc || '').length);
  console.log('params:', JSON.stringify(codemap.params));
  console.log('varible:', JSON.stringify(codemap.varible));
  console.log('dataKey:', codemap.dataKey, 'dataIdx:', codemap.dataIdx);
  // 操作码 134/135/136（非字符串）
  console.log('op134:', typeof codemap['134'], codemap['134'] ? JSON.stringify(codemap['134']).substring(0, 100) : '');
  console.log('op135:', typeof codemap['135'], codemap['135'] ? JSON.stringify(codemap['135']).substring(0, 100) : '');
  console.log('op136:', typeof codemap['136'], codemap['136'] ? JSON.stringify(codemap['136']).substring(0, 100) : '');
  // 关键操作码（taskarr 里的）
  [0, 1, 2, 3, 5, 6, 10, 12, 13, 14, 18, 20, 21, 22, 23, 32, 33, 35, 36, 39, 40, 41, 46, 48, 50, 51, 52, 56, 57, 59, 78, 116].forEach(op => {
    const code = codemap[String(op)];
    if (typeof code === 'string') console.log('op' + op + ':', code.substring(0, 60).replace(/\n/g, ' '));
  });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
