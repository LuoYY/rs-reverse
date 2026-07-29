/**
 * 验证同 nsd/cd 下管线 keys[33]/keys[34] 是否稳定
 * 若不稳定 → keys 解密对某些 cd 出错 → funcIdx 错 → codeUid 错 → 412
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first node test_keys_stability.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJs = fs.readFileSync(OUTER_JS, 'utf8');

function httpGet(url) {
  return new Promise(r => {
    https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ body: b, headers: res.headers }));
    }).on('error', () => r({ body: '', headers: {} }));
  });
}

(async () => {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const { runOuterVM } = require('./extract_dyncode_20080.js');
  const r = runOuterVM({ nsd, cd }, outerJs);
  console.log('固定 nsd=', nsd, 'cp3=', r.cp3);

  const keys33 = [], keys34 = [], codeUids = [], dynCodes = [];
  for (let t = 0; t < 6; t++) {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('./utils/paths').package));
    const gv = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
    fs.writeFileSync('/tmp/t.json', JSON.stringify(ts));
    const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, 'output'), level: 'warn', _: ['makecookie'] };
    const codeRet = await getCode(argv.jsurls);
    argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
    gv._setAttr('argv', argv);
    require('@src/config/')(gv);
    gv._setAttr('_ts', ts);
    const Coder = require('@src/handler/Coder');
    const Cookie = require('@src/handler/Cookie');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
    const runRet = coder.run();
    runRet.$_ts.cp[3] = r.cp3;
    gv.config.codemap = runRet.codemap;
    const ck = new Cookie(coder);
    ck.run();
    keys33.push(gv.utils.ascii2string(gv.keys[33]));
    keys34.push(gv.utils.ascii2string(gv.keys[34]));
    codeUids.push(ck.getCodeUid());
    dynCodes.push(coder.code.length + ':' + (coder.code === r.dynCode));
  }
  console.log('keys[33]:', JSON.stringify(keys33));
  console.log('keys[34]:', JSON.stringify(keys34));
  console.log('codeUid:', codeUids.map(x => '0x' + x.toString(16)));
  console.log('dynCode(len==沙箱):', dynCodes);
  console.log('keys[33] 稳定?', new Set(keys33).size === 1, ' keys[34] 稳定?', new Set(keys34).size === 1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
