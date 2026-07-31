/**
 * 56_save_rebuilt_code.js
 *
 * 保存 Coder 重建代码，与浏览器 dynCode 对比结构差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpGet(url) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'pmos.nx.sgcc.com.cn', port: 10443, path: '/', method: 'GET', rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Accept': '*/*' },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
    req.end();
  });
}

async function main() {
  const ch = await httpGet();
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战页'); return; }
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  fs.writeFileSync(path.join(OUT, 'rebuilt_sandbox_dyn.js'), r.dynCode || '');
  console.log('沙箱 dynCode 已保存:', r.dynLen);

  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  try {
    coder.run();
    fs.writeFileSync(path.join(OUT, 'rebuilt_code.js'), coder.code);
    console.log('重建代码已保存:', coder.code.length);
    console.log('含 _$d\$ 定义:', coder.code.includes('function _$d\$') || coder.code.includes('_$d\$=') ? 'YES' : 'NO');
    console.log('含 _$d\$ 引用:', (coder.code.match(/_\\\$d\\\$/g) || []).length, '次');
    // 对比：去掉变量名后的结构
    const sb = r.dynCode || '';
    // 比较函数定义数量
    const fnA = (coder.code.match(/function\s+_\\\$[a-zA-Z0-9_]{1,3}/g) || []).length;
    const fnB = (sb.match(/function\s+_\\\$[a-zA-Z0-9_]{1,3}/g) || []).length;
    console.log('重建函数数:', fnA, '沙箱函数数:', fnB);
  } catch (e) {
    console.log('Coder.run 失败:', e.message.substring(0, 80));
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
