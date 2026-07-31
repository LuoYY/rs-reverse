/**
 * stress_select.js — selectByCondition 多次验证
 *
 * 目的：确认结论可靠性
 * 1. 每次请求重新生成 query → 连续 N 次 POST → 应全部 200
 * 2. 复用同一 query → 第 2 次起应 400（防重放）
 * 3. 移除 Content-Type → 415
 * 4. 最小 headers（Content-Type + Cookie）→ 200
 *
 * 用法：node stress_select.js [次数]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';

function httpReq(url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: opts.method || 'GET', rejectUnauthorized: false, headers: opts.headers || {} }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', e => resolve({ status: 'ERR', body: e.message }));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const API_PATH = '/px-common-authority/marketMapping/selectByCondition';
const BODY = JSON.stringify({ data: { marketName: '', newMarketCode: '', newUrl: '', oldUrl: '' }, pageInfo: { pageSizes1: ['20', '50', '100', '200', '500', '1000'], pageSizes: [20, 50, 100, 200, 500, 1000], pageSize: 100, pageNum: 1 } });

let cookieStr = '';
let paramName = 'r20SZOQm';
let session = null;

const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function genQuery(gv, url) {
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  require('@src/handler/parser/constData').init();
  const keys2 = gv.keys[2];
  const keys17 = gv.keys[17];
  const basestr = gv.basestr;
  const time = Math.floor(Date.now() / 1000);
  const random = Math.random();
  const [key21] = numarrAddTime([...keys17], time, random);
  const randByte = () => Math.floor(Math.random() * 256);
  const crcUrl = crc32b(Buffer.from(url.toUpperCase()));
  const plain24 = [
    keys2[0] ^ PREFIX_MASK[0], keys2[1] ^ PREFIX_MASK[1], keys2[2], keys2[3] ^ PREFIX_MASK[3],
    keys2[4], keys2[5] ^ PREFIX_MASK[5], keys2[6], keys2[7] ^ PREFIX_MASK[7],
    randByte(), randByte(), randByte(), randByte(), randByte(),
    randByte(), randByte(), randByte(),
    0xb7, randByte(), randByte(),
    randByte(),
    (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
  ];
  const requestData = encryptMode1(plain24, key21, 0);
  const body = [1, 0, 48, ...keys2, 32, ...requestData];
  const crc = crc32b(Buffer.from(body));
  const b88 = [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body];
  return '0' + numarr2string(b88, basestr.split(''));
}

async function doRequest(headers, query) {
  const apiURL = 'https://pmos.xj.sgcc.com.cn:20080' + API_PATH + '?' + paramName + '=' + encodeURIComponent(query);
  const h = { ...headers, Cookie: cookieStr };
  const r = await Promise.race([httpReq(apiURL, { method: 'POST', headers: h, body: BODY }), new Promise(r => setTimeout(() => r({ status: 'TIMEOUT', body: '' }), 20000))]);
  return r.status;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  const { PmosXjClient } = require(path.join(ROOT, 'pmos_xj_client.js'));
  const client = new PmosXjClient();
  await client.init();
  cookieStr = client.cookieHeader;
  const gv = require('@src/handler/globalVarible');
  session = gv;
  paramName = gv.utils.ascii2string(gv.keys[7]).split(';')[1];
  console.log('[会话] paramName=' + paramName + ' cookie len=' + cookieStr.length);

  const minHeaders = { 'Content-Type': 'application/json;charset=UTF-8' };
  const noCTHeaders = {}; // 无 Content-Type

  console.log('\n=== 测试1: 连续 10 次，每次新 query + Content-Type ===');
  let ok = 0;
  for (let i = 0; i < 10; i++) {
    const query = genQuery(session, API_PATH);
    const s = await doRequest(minHeaders, query);
    if (s === 200) ok++;
    console.log(`  #${i + 1} → ${s}`);
  }
  console.log(`  通过率: ${ok}/10`);

  console.log('\n=== 测试2: 复用同一 query（防重放验证）===');
  const query2 = genQuery(session, API_PATH);
  for (let i = 0; i < 3; i++) {
    const s = await doRequest(minHeaders, query2);
    console.log(`  复用 #${i + 1} → ${s}`);
  }

  console.log('\n=== 测试3: 移除 Content-Type ===');
  const query3 = genQuery(session, API_PATH);
  const s3 = await doRequest(noCTHeaders, query3);
  console.log(`  无 Content-Type → ${s3}`);

  console.log('\n=== 测试4: 每轮新会话再测 5 次（跨会话稳定性）===');
  // 换一个新会话
  const client2 = new PmosXjClient();
  await client2.init();
  cookieStr = client2.cookieHeader;
  const gv2 = require('@src/handler/globalVarible');
  session = gv2;
  paramName = gv2.utils.ascii2string(gv2.keys[7]).split(';')[1];
  ok = 0;
  for (let i = 0; i < 5; i++) {
    const query = genQuery(session, API_PATH);
    const s = await doRequest(minHeaders, query);
    if (s === 200) ok++;
    console.log(`  新会话 #${i + 1} → ${s}`);
  }
  console.log(`  新会话通过率: ${ok}/5`);

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
