/**
 * 289_dump_keys_task.js
 *
 * 基于 99 号初始化，dump U14124020 任务完整 taskarr + codemap 操作码
 * 分析 keys2 生成逻辑（VM 反编译准备）
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
  gv._setAttr('utils', require('@src/handler/parser/common'));
  gv._setAttr('ts', coder.$_ts);

  // 只初始化 config（不跑 parser.init 的 runTask）
  try {
    require('@src/handler/parser').init(coder);
  } catch (e) {
    console.log('parser.init 错误:', e.message.substring(0, 100));
  }

  // dump 所有任务
  const valMap = gv.r2mka();
  const allKeys = Object.keys(valMap);
  console.log('任务 key 数:', allKeys.length);
  const uKeys = allKeys.filter(k => k.startsWith('U'));
  console.log('U 任务:', uKeys.join(', '));

  // dump 所有任务（含非 U）
  allKeys.forEach(k => {
    const tasks = gv.r2mka(k);
    if (Array.isArray(tasks)) {
      tasks.forEach(t => {
        const ta = t.taskarr || [];
        console.log('key=' + k, 'task key=' + t.key, 'taskarr(' + ta.length + '):', JSON.stringify(ta).substring(0, 120));
      });
    }
  });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
