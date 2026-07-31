/**
 * bisect_headers.js — 二分法测试 selectByCondition 哪些 header 是必须的
 *
 * 原理：从"完整 headers"（已验证 200）开始，逐个移除 header，
 * 用二分法快速定位"必须 header"集合。
 * 同时测试"最小 headers"（已验证 400）逐个添加 header，确认哪些能复活。
 *
 * 用法：node bisect_headers.js
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

// 完整 headers 基线（已验证 200）
const FULL_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Cache-Control': 'no-cache',
  'ClientTag': 'OUTNET_BROWSE',
  'Connection': 'keep-alive',
  'Content-Type': 'application/json;charset=UTF-8',
  'CurrentRoute': '/outNet',
  'Intercept-Headers': 'SKIP',
  'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
  'Pragma': 'no-cache',
  'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  'X-Ticket': 'undefined',
  'X-Token': 'null',
  'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};

const API_PATH = '/px-common-authority/marketMapping/selectByCondition';
const BODY = JSON.stringify({ data: { marketName: '', newMarketCode: '', newUrl: '', oldUrl: '' }, pageInfo: { pageSizes1: ['20', '50', '100', '200', '500', '1000'], pageSizes: [20, 50, 100, 200, 500, 1000], pageSize: 100, pageNum: 1 } });

let cookieStr = '';
let paramName = 'r20SZOQm';
let session = null;

async function initSession() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  const { PmosXjClient } = require(path.join(ROOT, 'pmos_xj_client.js'));
  const client = new PmosXjClient();
  await client.init();
  cookieStr = client.cookieHeader;
  console.log('[会话] cookie 有效, len=' + cookieStr.length);

  const gv = require('@src/handler/globalVarible');
  session = gv;
  paramName = gv.utils.ascii2string(gv.keys[7]).split(';')[1];
  console.log('[会话] paramName=' + paramName);
}

async function doRequest(headers) {
  // 生成新 query（每次请求重新生成，避免去重）
  const query = genQuery(session, API_PATH);
  const apiURL = 'https://pmos.xj.sgcc.com.cn:20080' + API_PATH + '?' + paramName + '=' + encodeURIComponent(query);
  const h = { ...headers, Cookie: cookieStr };
  const r = await httpReq(apiURL, { method: 'POST', headers: h, body: BODY });
  return r.status;
}

// 完整/最小测试（带超时保护）
async function test(headers, label) {
  try {
    const s = await Promise.race([doRequest(headers), new Promise(r => setTimeout(() => r('TIMEOUT'), 15000))]);
    return s;
  } catch (e) {
    return 'ERR';
  }
}

// 二分法：从完整集合中逐个剔除，找最小必须子集
async function bisectHeaders() {
  const headerKeys = Object.keys(FULL_HEADERS);
  console.log('\n=== 二分法：从完整 headers 逐个剔除 ===\n');

  // 先测基线
  const base = await test(FULL_HEADERS, 'full');
  console.log('[基线] 完整 headers → ' + base);
  if (base !== 200) { console.log('基线不是 200，无法二分！'); return; }

  // 二分剔除：每次移除一半，看是否还 200
  // 若移除后仍 200 → 这部分 header 不必要，保留移除
  // 若移除后非 200 → 这部分有必须 header，需要细分
  let current = { ...FULL_HEADERS };
  let removed = [];

  // 逐个 header 移除测试（简单可靠）
  console.log('\n=== 逐个移除测试 ===');
  const required = [];
  for (const key of headerKeys) {
    const testHeaders = { ...current };
    delete testHeaders[key];
    const s = await test(testHeaders, 'remove ' + key);
    const still200 = s === 200;
    console.log(`  移除 ${key} → ${s} ${still200 ? '（可移除）' : '（★★★ 必须！）'}`);
    if (still200) {
      current = testHeaders; // 移除后仍 200，从当前集合中删除
    } else {
      required.push(key);
    }
  }

  console.log('\n=== 必须 headers（移除后非 200） ===');
  for (const k of required) {
    console.log(`  ${k}: ${JSON.stringify(FULL_HEADERS[k])}`);
  }

  console.log('\n=== 最小可行集合 ===');
  const minimal = {};
  for (const k of Object.keys(current)) {
    if (!required.includes(k)) minimal[k] = current[k];
  }
  // 必须的保留
  for (const k of required) minimal[k] = FULL_HEADERS[k];
  console.log(Object.keys(minimal).join(', '));

  // 验证最小集合
  const minS = await test(minimal, 'minimal');
  console.log('\n[验证] 最小集合 → ' + minS);

  // 再测一次更小的：只保留必须 headers + Cookie
  console.log('\n=== 只保留必须 headers 测试 ===');
  const onlyRequired = { Cookie: cookieStr };
  for (const k of required) onlyRequired[k] = FULL_HEADERS[k];
  const onlyS = await test(onlyRequired, 'onlyRequired');
  console.log('  只保留必须 headers → ' + onlyS);
}

// genQuery 从 pure_query_gen 复制（复用管线）
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

(async () => {
  await initSession();
  await bisectHeaders();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
