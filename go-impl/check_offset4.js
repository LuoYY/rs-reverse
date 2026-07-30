// 验证 offset [3,157,3,0,5,2,6,4] 是否跨 cd 恒定
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.resolve(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

function recoverOffset(cdArr, end, keys) {
  var fullOffset = [0,0,0,0,0,0,0,0];
  // offset[0]: ans[0] = keys.length
  fullOffset[0] = cdArr[end] ^ keys.length;
  // step=2: gap0 = ans[1]<<8|ans[2], key0 starts at ans[3]
  var op = 1;
  for (var i = 0; i < keys.length; i++) {
    var gap = keys[i].length;
    // gap encoded at ans[op], ans[op+1]
    fullOffset[op % 8] = cdArr[end + op] ^ (gap >> 8);
    fullOffset[(op+1) % 8] = cdArr[end + op + 1] ^ (gap & 255);
    op += 2;
    // key bytes
    for (var j = 0; j < gap; j++) {
      fullOffset[op % 8] = cdArr[end + op] ^ keys[i][j];
      op++;
    }
  }
  return fullOffset;
}

(async () => {
  for (var round = 0; round < 5; round++) {
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

    const decrypt = require('@src/handler/parser/common/decrypt');
    const cdArr = decrypt(gv.ts.cd);
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    var offset = recoverOffset(cdArr, end, gv.keys);
    // Check if offset depends on cdArr[0] or cdArr[1] or nsd parity
    console.log('round' + round + ' nsd=' + nsd + ' cdArr[0]=' + cdArr[0] + ' cdArr[1]=' + cdArr[1] + ' end=' + end + ' offset=' + JSON.stringify(offset));
  }
  process.exit(0);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
