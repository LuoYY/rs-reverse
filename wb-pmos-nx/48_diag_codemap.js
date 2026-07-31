/**
 * 48_diag_codemap.js
 *
 * 诊断 Coder.run() 重建代码与 codemap 提取
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Accept': '*/*' },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
    req.end();
  });
}

async function main() {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战页'); return; }
  const nsd = +m[1], cd = m[2];
  console.log('nsd=' + nsd);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  console.log('沙箱 cp3:', r.cp3, 'dynLen:', r.dynLen);

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
    console.log('initTs cp 数组长度:', coder.$_ts.cp ? coder.$_ts.cp.length : '无');
    console.log('initTs cp[3]:', coder.$_ts.cp ? coder.$_ts.cp[3] : '无');
    console.log('沙箱 cp3  :', r.cp3);
    coder.run();
    console.log('重建代码 len:', coder.code.length);
    console.log('含 0>one>:', coder.code.includes('0>one>') ? 'YES' : 'NO');
    console.log('含 child_one:', coder.code.includes('child_one') ? 'YES' : 'NO');
    console.log('含 r2mKa:', coder.code.includes('r2mKa') ? 'YES' : 'NO');
    // 与沙箱 dynCode 对比
    console.log('重建代码 == 沙箱dynCode:', coder.code === r.dynCode ? 'YES' : 'NO');
    if (coder.code !== r.dynCode) {
      let d = -1;
      for (let i = 0; i < Math.min(coder.code.length, r.dynCode.length); i++) {
        if (coder.code[i] !== r.dynCode[i]) { d = i; break; }
      }
      console.log('首个差异 @' + d, '重建len=' + coder.code.length, 'dynLen=' + r.dynCode.length);
    }
    // codemap 提取
    const getCodemap = require('@utils/getCodemap');
    try {
      const cm = getCodemap(coder.code);
      console.log('codemap OK, 键数:', Object.keys(cm).length);
    } catch (e) {
      console.log('codemap 失败:', e.message.substring(0, 80));
      // 尝试从沙箱 dynCode 提取
      try {
        const cm2 = getCodemap(r.dynCode);
        console.log('从沙箱dynCode提取 codemap OK, 键数:', Object.keys(cm2).length);
      } catch (e2) {
        console.log('从沙箱dynCode也失败:', e2.message.substring(0, 80));
      }
    }
  } catch (e) {
    console.log('Coder.run 失败:', e.message.substring(0, 100));
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
