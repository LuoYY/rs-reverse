/**
 * 99_dump_tasktree.js
 *
 * 构建 nx 任务树（不执行 runTask），dump U14124020 任务的 taskarr + 对应 codemap 代码
 * 分析 _$cu() 等 dispatcher 残留代码来源。
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
  // 补充 codemap 函数注入（与 getCodemap 一致）
  gv.config.codemap = codemap;

  // 真实 init（会执行 tscd.init → runTaskByUid，预期报错，catch 后 dump）
  gv._setAttr('utils', require('@src/handler/parser/common'));
  gv._setAttr('ts', coder.$_ts);
  try {
    require('@src/handler/parser').init(coder);
  } catch (e) {
    console.log('parser.init 错误:', e.message.substring(0, 100));
  }
  // dump r2mka valMap 所有 keys
  const allKeys = Object.keys(gv.r2mka());
  console.log('r2mka 总 key 数:', allKeys.length);
  console.log('r2mka keys:', allKeys.join(', '));
  console.log('含 U 的任务:', allKeys.filter(k => k.startsWith('U')).join(', '));
  console.log('含 U14124020:', allKeys.includes('U14124020'));
  const uid = 'U14124020';
  const tasks = gv.r2mka(uid);
  if (!tasks) { console.log('U14124020 不存在'); process.exit(1); }
  console.log('U14124020 任务数:', tasks.length);
  const task = tasks[0] || tasks;
  console.log('U14124020 task.key:', task.key, 'taskarr len:', task.taskarr ? task.taskarr.length : '无');
  const ta = tasks.taskarr || [];
  console.log('taskarr 前 30:', JSON.stringify(ta.slice(0, 30)));
  // 对应 codemap 代码
  ta.slice(0, 20).forEach((idx2, i) => {
    const code = codemap[idx2];
    console.log(`[${i}] task[${idx2}]:`, typeof code === 'string' ? code.substring(0, 120).replace(/\n/g, ' ') : '非字符串');
  });
  // 找 _$cu() 出现位置
  console.log('\n含 _$cu() 的 task:', ta.filter(idx2 => typeof codemap[idx2] === 'string' && codemap[idx2].includes('_$cu')).map(idx2 => idx2).join(','));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
