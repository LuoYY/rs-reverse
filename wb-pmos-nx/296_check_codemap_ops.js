/**
 * 296_check_codemap_ops.js
 *
 * 检查 codemap 操作码完整性（134/135/136 是否缺失）
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

  // 所有 keys（数字排序）
  const keys = Object.keys(codemap).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  console.log('数字操作码 keys:', keys.length, '范围:', keys[0], '-', keys[keys.length - 1]);
  // 检查连续
  const missing = [];
  for (let i = keys[0]; i <= keys[keys.length - 1]; i++) if (!keys.includes(i)) missing.push(i);
  console.log('缺失操作码:', missing.join(', ') || '无');

  // 134/135/136 内容
  [134, 135, 136, 137, 138].forEach(op => {
    const v = codemap[String(op)];
    console.log('op' + op + ':', typeof v, typeof v === 'string' ? v.substring(0, 80).replace(/\n/g, ' ') : JSON.stringify(v).substring(0, 80));
  });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
