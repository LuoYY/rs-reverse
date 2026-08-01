/**
 * 106_compare_codemap.js
 *
 * 对比 xj 与 nx 的 codemap 提取（ifConditional2switch 输出）
 * 看 U14124020 相关 task 代码的差异（xj 能跑，nx 不能）
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
  return { nsd, code: coder.code };
}

(async () => {
  for (const site of ['xj', 'nx']) {
    console.log(`\n===== ${site} =====`);
    const { nsd, code } = await buildCode(site);
    const ifConditional2switch = require('sdenv-extract/src/plugins/ifConditional2switch');
    const result = ifConditional2switch(null, { input: code });
    console.log('输出:', result.length);
    result.forEach((r, i) => {
      if (r.path.indexOf('_codemap_') >= 0) {
        try {
          const cm = JSON.parse(r.content);
          console.log(' ', r.path, 'keys:', Object.keys(cm).length, 'commonFunc:', (cm.commonFunc || '').length);
        } catch (e) {}
      }
    });
    // main_codemap 的 task 代码
    const mc = result.filter(r => r.path.indexOf('main_codemap') === 0).pop();
    if (mc) {
      const cm = JSON.parse(mc.content);
      console.log('main_codemap task 代码样例:');
      for (const t of ['51', '56', '14', '2', '57', '0', '3', '36']) {
        console.log('  [' + t + ']:', cm[t] ? cm[t].substring(0, 75).replace(/\n/g, ' ') : '无');
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
