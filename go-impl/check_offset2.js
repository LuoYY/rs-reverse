// 检查 offset 是否真的需要
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = path.resolve(__dirname, '..');
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
function httpGet(url) { return new Promise(r => { https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', e => r({ status: 'ERR', body: '' })); }); }

(async () => {
  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/');
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
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

  // Check offset
  console.log('dynamicTaskOffset:', JSON.stringify(gv.dynamicTaskOffset));
  console.log('offsetConst:', JSON.stringify(gv.config.offsetConst));

  // Manually run tscd to see what offset is
  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(gv.ts.cd);
  const start = 2;
  const end = (cdArr[0] << 8 | cdArr[1]) + start;
  console.log('cdArr total len:', cdArr.length, 'task section end:', end);
  console.log('remaining bytes:', cdArr.length - end);

  // Check what offset would be needed
  // Try offset = [0,0,0,0,0,0,0,0]
  const ans0 = cdArr.slice(end);
  const keys0raw = ans0.slice(0, 20);
  console.log('first 20 raw bytes (no offset):', keys0raw);

  // Try with actual keys
  console.log('keys[16]:', gv.keys[16]);
  console.log('keys[2] head:', gv.keys[2].slice(0, 8));

  // Reverse engineer: what offset makes ans[0] correct?
  // ans[0] = number of keys, should be ~35-40
  // With offset 0: ans[0] = cdArr[end]
  console.log('ans[0] with no offset:', cdArr[end]);

  // The offset XORs each byte: ans[i] = cdArr[end+i] ^ offset[i%8]
  // If ans[0] should be ~35, and cdArr[end] is X, then offset[0] = X ^ 35
  // But we don't know the exact expected value...
  // Let's just check if gv.keys matches with offset=0
  // Actually, let me look at what genKeys expects
  // genKeys reads ans[0] as number of keys, then reads length-prefixed key arrays
  // If offset is wrong, the lengths will be garbage -> panic

  process.exit(0);
})().catch(e => { console.error('ERR: ' + e.message); process.exit(1); });
