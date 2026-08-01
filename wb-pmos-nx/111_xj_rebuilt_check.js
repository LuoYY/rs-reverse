/**
 * 111_xj_rebuilt_check.js
 *
 * 检查 xj 的 rebuiltCode IIFE 结构 + scj/aebi 状态
 * 理解 xj（eval body 完整执行）为何成功：scj 是否有值 / body 是否引用 scj
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
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/111-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/111-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
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
  console.log('scj 类型:', typeof coder.$_ts.scj, '长度:', coder.$_ts.scj ? coder.$_ts.scj.length : 'N/A');
  console.log('aebi 类型:', typeof coder.$_ts.aebi, '长度:', Array.isArray(coder.$_ts.aebi) ? coder.$_ts.aebi.length : 'N/A');
  console.log('IIFE 开头 120:', JSON.stringify(rebuilt.substring(0, 120)));
  // IIFE 调用参数（结尾）
  console.log('IIFE 结尾 120:', JSON.stringify(rebuilt.substring(rebuilt.length - 120)));
  // body 是否引用 scj 参数（IIFE 第2参数）
  const m = rebuilt.match(/\(function\(([^)]+)\)\{/);
  if (m) {
    const params = m[1].split(',');
    console.log('IIFE 参数:', params);
    if (params[1]) {
      const scjParam = params[1].trim();
      const bodyStart = rebuilt.indexOf('{') + 1;
      const body = rebuilt.substring(bodyStart, rebuilt.lastIndexOf('})('));
      console.log('body 引用', scjParam, '次数:', (body.match(new RegExp('\\b' + scjParam + '\\b', 'g')) || []).length);
    }
  }
  // 检查 eval body（原版注入）在 xj 下的行为——用 scj/aebi
  const bodyStart = rebuilt.indexOf('{');
  const bodyEnd = rebuilt.lastIndexOf('})(');
  const body = rebuilt.substring(bodyStart + 1, bodyEnd);
  console.log('body len:', body.length);
  try {
    const fn = new Function(m ? m[1].split(',').map(s => s.trim()) : ['_$a', '_$b'], body);
    const t0 = Date.now();
    fn(coder.$_ts.scj, coder.$_ts.aebi);
    console.log('eval body 完成', Date.now() - t0, 'ms');
  } catch (e) {
    console.log('eval body 错误:', e.message.substring(0, 80));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
