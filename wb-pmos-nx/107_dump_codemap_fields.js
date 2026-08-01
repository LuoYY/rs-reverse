/**
 * 107_dump_codemap_fields.js
 *
 * dump xj 与 nx 的 main_codemap 关键字段（params/varible/taskarr/commonFunc 等）
 * 找 xj 能跑、nx 不能跑的结构差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

async function getCodemap(site) {
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
  const ifConditional2switch = require('sdenv-extract/src/plugins/ifConditional2switch');
  const result = ifConditional2switch(null, { input: coder.code });
  const mc = result.filter(rr => rr.path.indexOf('main_codemap') === 0).pop();
  return { cm: JSON.parse(mc.content), code: coder.code, nsd };
}

(async () => {
  for (const site of ['xj', 'nx']) {
    console.log(`\n===== ${site} =====`);
    const { cm, nsd } = await getCodemap(site);
    console.log('nsd:', nsd);
    console.log('params:', JSON.stringify(cm.params));
    console.log('taskFactory:', cm.taskFactory);
    console.log('keyname:', cm.keyname);
    console.log('taskarr:', cm.taskarr);
    console.log('dataKey:', cm.dataKey, 'dataIdx:', cm.dataIdx);
    console.log('ret0-3:', cm.ret0, cm.ret1, cm.ret2, cm.ret3);
    console.log('globalRes:', cm.globalRes, 'loopRes:', cm.loopRes);
    console.log('forcur:', cm.forcur, 'formax:', cm.formax);
    console.log('varible 数量:', Array.isArray(cm.varible) ? cm.varible.length : '非数组');
    console.log('varible 前 20:', Array.isArray(cm.varible) ? cm.varible.slice(0, 20).join(', ') : '');
    // 检查 U14124020 task 引用的栈变量是否在 varible
    const taskCode = Object.keys(cm).filter(k => typeof cm[k] === 'string' && k !== 'commonFunc').map(k => cm[k]).join(';');
    const stackVars = [...new Set([...taskCode.matchAll(/_\$[a-zA-Z0-9_$]{1,5}/g)].map(m => m[0]))];
    console.log('task 代码引用变量数:', stackVars.length);
    const inVarible = stackVars.filter(v => Array.isArray(cm.varible) && cm.varible.includes(v));
    console.log('task 变量在 varible 中:', inVarible.length, '个，样例:', inVarible.slice(0, 10).join(', '));
    const inParams = stackVars.filter(v => (cm.params || []).includes(v));
    console.log('task 变量在 params 中:', inParams.join(', ') || '无');
    const notFound = stackVars.filter(v => !(Array.isArray(cm.varible) && cm.varible.includes(v)) && !(cm.params || []).includes(v) && v !== cm.taskFactory && v !== cm.keyname && v !== cm.globalRes && v !== cm.loopRes && v !== cm.forcur && v !== cm.formax && v !== cm.dataKey && v !== cm.dataIdx && !['ret0','ret1','ret2','ret3'].includes(v) && cm[v] === undefined);
    console.log('task 变量未在任何环境声明:', notFound.length, '个:', notFound.slice(0, 15).join(', '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
