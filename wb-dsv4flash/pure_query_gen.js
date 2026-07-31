/**
 * pure_query_gen.js
 *
 * 瑞数 VMP 纯算法 query 参数生成器（不依赖浏览器）
 *
 * 算法（2026-07-31 完全破解）：
 *   query = '0' + numarr2string(88B, basestr)
 *   88B = [CRC32(4B)][1][0][48][session_data=keys2 48B][32][request_data 32B]
 *   request_data = encryptMode1(plain24, numarrAddTime(keys17,time,random)[0], flag=0)
 *   plain24 = [keys2[0]^0x0b, keys2[1]^0x16, keys2[2], keys2[3]^0x10, keys2[4],
 *              keys2[5]^0x31, keys2[6], keys2[7]^0x01,           ← 8B 服务器校验（固定掩码）
 *              rand×5,                                          ← 8-12 不校验
 *              rand×3,                                          ← 13-15 time 不校验
 *              0xb7, rand×2,                                    ← 16-18 常量+随机 不校验
 *              rand,                                            ← 19 counter 不校验
 *              CRC32(url.toUpperCase())]                        ← 20-23 服务器校验
 *
 * 用法：node pure_query_gen.js <url> [method]
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

// 站点固定掩码（跨 5 个会话验证恒定，prefix[0..7] 服务器校验）
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
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** 初始化会话：拉挑战 → cp3 → 管线 → keys + cookie */
async function initSession() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));

  // 1. 拉挑战页
  const ch = await httpReq(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) throw new Error('挑战页无 $_ts: ' + ch.status);
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = setCookies.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('[会话] nsd=' + nsd + ' cdLen=' + cd.length + ' O=' + oCookie.substring(0, 20) + '...');

  // 2. cp3
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJs);
  if (!r.cp3) throw new Error('cp3 提取失败');
  console.log('[会话] cp3 提取成功');

  // 3. 管线 → keys + cookie
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  const tmpTs = '/tmp/pure-query-ts.json';
  fs.writeFileSync(tmpTs, JSON.stringify(ts));
  const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
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
  console.log('[会话] cookie: ' + name + ' len=' + cookie.length + ' param=' + paramName);

  return { gv, cookie, name, oCookie, paramName };
}

/** 生成 query */
function genQuery(gv, url) {
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  require('@src/handler/parser/constData').init();

  const keys2 = gv.keys[2];
  const keys17 = gv.keys[17];
  const basestr = gv.basestr;

  // queryKey = numarrAddTime(keys17, time, random)
  const time = Math.floor(Date.now() / 1000);
  const random = Math.random();
  const [key21] = numarrAddTime([...keys17], time, random);

  // plain24
  const randByte = () => Math.floor(Math.random() * 256);
  const crcUrl = crc32b(Buffer.from(url.toUpperCase()));
  const plain24 = [
    keys2[0] ^ PREFIX_MASK[0], keys2[1] ^ PREFIX_MASK[1], keys2[2], keys2[3] ^ PREFIX_MASK[3],
    keys2[4], keys2[5] ^ PREFIX_MASK[5], keys2[6], keys2[7] ^ PREFIX_MASK[7],
    randByte(), randByte(), randByte(), randByte(), randByte(),          // 8-12 任意
    randByte(), randByte(), randByte(),                                   // 13-15 任意
    0xb7, randByte(), randByte(),                                         // 16-18 任意
    randByte(),                                                            // 19 任意
    (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255, // 20-23 URL CRC32
  ];

  // request_data = encryptMode1(plain24, key21, 0)
  const requestData = encryptMode1(plain24, key21, 0);

  // 88B = [crc4][1][0][48][keys2][32][requestData]
  const body = [1, 0, 48, ...keys2, 32, ...requestData];
  const crc = crc32b(Buffer.from(body));
  const b88 = [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body];

  return '0' + numarr2string(b88, basestr.split(''));
}

/** 主流程：生成 query 并 POST 验证 */
async function main() {
  const url = process.argv[2] || '/px-gateway/GatewayConfig/getGatewayConfig';
  const method = process.argv[3] || 'POST';

  console.log('=== 纯算法 query 生成器 ===\n');
  const { gv, cookie, name, oCookie, paramName } = await initSession();

  // 验证 cookie（重放 /）
  const header = `${oCookie}; ${name}=${cookie}`;
  const r0 = await httpReq(TARGET, { headers: { 'User-Agent': UA, 'Cookie': header } });
  console.log('\n[验证] cookie 重放 / →', r0.status, r0.status === 200 ? '✓ cookie 有效' : '✗ cookie 无效');

  // 生成 query
  const query = genQuery(gv, url);
  console.log('\n[生成] query (' + query.length + ' 字符): ' + query.substring(0, 60) + '...');
  console.log('      参数名: ' + paramName);

  // 用生成器 POST
  const body = JSON.stringify({ a: 1 });
  const u = new URL(TARGET.replace(/\/$/, '') + url);
  const r = await httpReq(TARGET.replace(/\/$/, '') + url + '?' + paramName + '=' + encodeURIComponent(query), {
    method, headers: { 'User-Agent': UA, 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': Buffer.byteLength(body), 'Cookie': header },
    body,
  });
  console.log('\n[结果] ' + method + ' ' + url + ' →', r.status);
  console.log('      响应前 150 字符:', r.body.substring(0, 150));

  if (r.status === 200) {
    console.log('\n★★★ 纯算法 query 生成成功！服务器接受！');
  } else {
    console.log('\n✗ 失败。body:', r.body.substring(0, 300));
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
