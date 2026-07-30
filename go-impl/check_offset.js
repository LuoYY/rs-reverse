// 检查 dynamicTaskOffset 是否跨 cd 恒定
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.resolve(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  for (let i = 0; i < 5; i++) {
    const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) continue;
    const nsd = +m[1], cd = m[2];
    const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
    const r = runOuterVM({ nsd, cd }, outerJsCode);
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(ROOT);
    const gv = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const tsFull = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
    fs.writeFileSync('/tmp/t.json', JSON.stringify(tsFull));
    const argv = { file: '/tmp/t.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
    const codeRet = await getCode(argv.jsurls);
    argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
    gv._setAttr('argv', argv); require('@src/config/')(gv); gv._setAttr('_ts', tsFull);
    const Coder = require('@src/handler/Coder'); const Cookie = require('@src/handler/Cookie');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...tsFull }, gv.config.immucfg);
    const runRet = coder.run(); runRet['$_ts'].cp[3] = r.cp3; gv.config.codemap = runRet.codemap;
    new Cookie(coder).run();
    console.log('nsd=' + nsd + ' offset=' + JSON.stringify(gv.dynamicTaskOffset));
  }
})().catch(e => console.error('ERR: ' + e.message));
