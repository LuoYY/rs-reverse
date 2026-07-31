/**
 * stress_test.js
 *
 * 压力测试：同一会话内连续生成多个 query（不同 URL + 不同方法）
 * 验证 query 生成的稳定性与多请求支持
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

function httpReq(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: opts.method || 'GET', rejectUnauthorized: false, headers: opts.headers || {} }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, headers: {}, body: '' }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function initSession() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const ch = await httpReq(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/stress-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/stress-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const Cookie = require('@src/handler/Cookie');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  const paramName = gv.utils.ascii2string(gv.keys[7]).split(';')[1];
  const header = `${oCookie}; ${name}=${cookie}`;
  const replay = await httpReq(TARGET, { headers: { 'User-Agent': UA, 'Cookie': header } });
  if (replay.status !== 200) throw new Error('cookie 无效: ' + replay.status);
  return { gv, header, paramName };
}

function genQuery(gv, url) {
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  require('@src/handler/parser/constData').init();
  const keys2 = gv.keys[2], keys17 = gv.keys[17], basestr = gv.basestr;
  const [key21] = numarrAddTime([...keys17], Math.floor(Date.now() / 1000), Math.random());
  const randByte = () => Math.floor(Math.random() * 256);
  const crcUrl = crc32b(Buffer.from(url.toUpperCase()));
  const plain24 = [
    keys2[0] ^ PREFIX_MASK[0], keys2[1] ^ PREFIX_MASK[1], keys2[2], keys2[3] ^ PREFIX_MASK[3],
    keys2[4], keys2[5] ^ PREFIX_MASK[5], keys2[6], keys2[7] ^ PREFIX_MASK[7],
    randByte(), randByte(), randByte(), randByte(), randByte(),
    randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
    (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
  ];
  const requestData = encryptMode1(plain24, key21, 0);
  const body = [1, 0, 48, ...keys2, 32, ...requestData];
  const crc = crc32b(Buffer.from(body));
  return '0' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], basestr.split(''));
}

async function main() {
  console.log('=== 压力测试：同一会话多请求 ===\n');
  const { gv, header, paramName } = await initSession();
  console.log('[会话] 建立成功 param=' + paramName + '\n');

  const tests = [
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{}' },
    { m: 'GET', u: '/px-gateway/GatewayConfig/security' },
    { m: 'POST', u: '/px-common-authcenter/auth/v2/captcha/get', b: '{}' },
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{"a":1}' },
    { m: 'GET', u: '/px-gateway/GatewayConfig/security' },
    { m: 'POST', u: '/px-common-authcenter/auth/v2/verifyType/get', b: '{}' },
  ];

  let pass = 0;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const query = genQuery(gv, t.u);
    const r = await httpReq(TARGET.replace(/\/$/, '') + t.u + '?' + paramName + '=' + encodeURIComponent(query), {
      method: t.m,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': t.b ? Buffer.byteLength(t.b) : 0, 'Cookie': header },
      body: t.b,
    });
    const ok = r.status === 200;
    if (ok) pass++;
    console.log(`  [${i}] ${t.m} ${t.u} → ${r.status} ${ok ? '✓' : '✗'} ${ok ? '' : r.body.substring(0, 80)}`);
    await new Promise(r2 => setTimeout(r2, 300));
  }
  console.log(`\n结果: ${pass}/${tests.length}`);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
