/**
 * 292_dump_opcodes.js
 *
 * dump U14124020 完整 taskarr + 全部操作码代码（VM 反编译准备）
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
  try {
    require('@src/handler/parser').init(coder);
  } catch (e) {
    console.log('parser.init 错误:', e.message.substring(0, 100));
  }

  // dump U14124020 任务（在 catch 后 valMap 可能被 pop，尝试再次获取）
  try {
    const tasks = gv.r2mka('U14124020');
    console.log('U14124020:', tasks ? tasks.length + ' 个' : '不存在');
    if (tasks && tasks[0]) {
      const ta = tasks[0].taskarr || [];
      console.log('taskarr(' + ta.length + '):', JSON.stringify(ta));
      const cm = gv.config.codemap;
      ta.forEach((idx, i) => {
        const code = cm[idx];
        console.log('\ntask[' + i + ']=' + idx + ':');
        if (typeof code === 'string') {
          console.log(code.substring(0, 300));
        } else {
          console.log('非字符串:', typeof code);
        }
      });
    }
  } catch (e) {
    console.log('U14124020 dump 错误:', e.message.substring(0, 60));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
