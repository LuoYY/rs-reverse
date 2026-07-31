const fs = require("fs");
const path = require("path");
const https = require("https");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const ROOT = "/Users/luoyy/work/github/GitHub/rs-reverse_glm";

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

(async () => {
  // Generate fresh cookie + query using the pure generator
  const { execSync } = require('child_process');
  // Use pure_query_gen to get a fresh session - but we need to capture intermediate
  // Instead, use the genQuery approach with our own pipeline
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(ROOT);
  
  const { PmosXjClient } = require(path.join(ROOT, 'pmos_xj_client.js'));
  const client = new PmosXjClient();
  await client.init();
  
  // Get cookie string
  const cookieStr = client.cookieHeader;
  console.log('Cookie ready:', cookieStr.substring(0, 50) + '...');
  
  // Get keys for query generation
  const gv = require('@src/handler/globalVarible');
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  require('@src/handler/parser/constData').init();
  
  const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
  function crc32b(buf) {
    let c = 0xffffffff;
    for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return (c ^ 0xffffffff) >>> 0;
  }
  
  function genQuery(gv, url) {
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
  
  const url = '/px-common-authority/marketMapping/selectByCondition';
  const query = genQuery(gv, url);
  const paramName = gv.utils.ascii2string(gv.keys[7]).split(';')[1];
  console.log('Query param:', paramName, 'len:', query.length);
  
  const body = JSON.stringify({"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}});
  
  const fullHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'ClientTag': 'OUTNET_BROWSE',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json;charset=UTF-8',
    'Cookie': cookieStr,
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
  
  // Test 1: full headers
  const apiURL = 'https://pmos.xj.sgcc.com.cn:20080' + url + '?' + paramName + '=' + encodeURIComponent(query);
  const r1 = await httpReq(apiURL, { method: 'POST', headers: fullHeaders, body });
  console.log('\n[完整 headers] POST selectByCondition →', r1.status);
  
  // Test 2: minimal headers
  const minimalHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json;charset=UTF-8',
    'Cookie': cookieStr,
    'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
    'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  };
  const r2 = await httpReq(apiURL, { method: 'POST', headers: minimalHeaders, body });
  console.log('[最小 headers] POST selectByCondition →', r2.status);
  
  // Test 3: getGatewayConfig with full headers
  const url3 = '/px-gateway/GatewayConfig/getGatewayConfig';
  const query3 = genQuery(gv, url3);
  const apiURL3 = 'https://pmos.xj.sgcc.com.cn:20080' + url3 + '?' + paramName + '=' + encodeURIComponent(query3);
  const r3 = await httpReq(apiURL3, { method: 'POST', headers: fullHeaders, body: '{}' });
  console.log('[完整 headers] POST getGatewayConfig →', r3.status);
  
  // Test 4: GET selectByCondition (empty body)
  const r4 = await httpReq(apiURL, { method: 'GET', headers: fullHeaders });
  console.log('[完整 headers] GET selectByCondition →', r4.status, r4.body.substring(0, 100));
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
