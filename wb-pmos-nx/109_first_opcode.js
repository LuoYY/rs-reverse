/**
 * 109_first_opcode.js
 *
 * dump xj（taskarr[0]=62）与 nx（taskarr[0]=51）的第一个操作码代码
 * 分析为何 xj 能跑、nx 不能（第一个操作码是否访问未初始化环境）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

async function build(site) {
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
  gv._setAttr('rebuiltCode', coder.code);
  gv._setAttr('utils', require('@src/handler/parser/common'));
  gv._setAttr('ts', coder.$_ts);
  require('@src/handler/parser/r2mka').init(coder.r2mkaText);
  require('@src/handler/parser/tscp').init(coder);
  require('@src/handler/parser/constData').init();
  const ifConditional2switch = require('sdenv-extract/src/plugins/ifConditional2switch');
  const result = ifConditional2switch(null, { input: coder.code });
  const mc = result.filter(rr => rr.path.indexOf('main_codemap') === 0).pop();
  const cm = JSON.parse(mc.content);
  const tasks = gv.r2mka('U14124020');
  const taskarr = tasks && tasks[0] ? tasks[0].taskarr : [];
  return { nsd, taskarr, cm, code: coder.code };
}

(async () => {
  for (const site of ['xj', 'nx']) {
    console.log(`\n===== ${site} =====`);
    const { nsd, taskarr, cm } = await build(site);
    console.log('nsd:', nsd, 'taskarr 前 8:', JSON.stringify(taskarr.slice(0, 8)));
    // 前 5 个操作码
    taskarr.slice(0, 5).forEach((t, i) => {
      console.log('  op[' + i + ']=' + t + ':', cm[t] ? cm[t].substring(0, 110).replace(/\n/g, ' ') : '无');
    });
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
