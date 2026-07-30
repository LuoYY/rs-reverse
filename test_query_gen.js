// Test: can we generate valid queries by reusing the fixed part + random 4 bytes?
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const https = require('https');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const page = await context.newPage();

  // Capture one query from the browser session
  let capturedQuery = null;
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=') && !capturedQuery) {
      capturedQuery = url.match(/r20SZOQm=([^&]+)/)?.[1];
    }
  });

  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const cookies = await context.cookies();
  const pVal = cookies.find(c => c.name.endsWith('P'))?.value;
  const oVal = cookies.find(c => c.name.endsWith('O'))?.value;
  const oName = cookies.find(c => c.name.endsWith('O'))?.name;
  
  await browser.close();

  if (!capturedQuery) { console.log('No query captured'); process.exit(1); }
  
  const pName = oName.replace(/O$/, 'P');
  const cookieHeader = oName + '=' + oVal + '; ' + pName + '=' + pVal;
  
  // The query format: "0" + encoded(36 bytes)
  // bytes[0-3] = random, bytes[4-35] = fixed
  // Extract the fixed part from captured query
  const basestr = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  basestr.split("").forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  function decode(str) {
    const numarr = []; let i = 0;
    const full = Math.floor(str.length / 4);
    for (let g = 0; g < full; g++) {
      const c0 = idxmap[str[i]], c1 = idxmap[str[i+1]], c2 = idxmap[str[i+2]], c3 = idxmap[str[i+3]];
      i += 4; numarr.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
    }
    const rem = str.length - i;
    if (rem === 2) numarr.push((idxmap[str[i]]<<2)|(idxmap[str[i+1]]>>4));
    else if (rem === 3) numarr.push((idxmap[str[i]]<<2)|(idxmap[str[i+1]]>>4), ((idxmap[str[i+1]]&15)<<4)|(idxmap[str[i+2]]>>2));
    return numarr;
  }
  function encode(bytes, basestr) {
    const keys = basestr.split('');
    const ans = []; let idx = 0;
    while (idx < bytes.length - 2) {
      const one = bytes[idx], two = bytes[idx+1], three = bytes[idx+2];
      idx += 3;
      ans.push(keys[one>>2], keys[(one&3)<<4|two>>4], keys[(two&15)<<2|three>>6], keys[three&63]);
    }
    if (idx < bytes.length) {
      const b0 = bytes[idx]; const b1 = idx+1 < bytes.length ? bytes[idx+1] : 0;
      ans.push(keys[b0>>2], keys[(b0&3)<<4|b1>>4]);
      if (idx+1 < bytes.length) ans.push(keys[(b1&15)<<2]);
    }
    return ans.join('');
  }
  
  const payload = capturedQuery.startsWith('0') ? capturedQuery.slice(1) : capturedQuery;
  const queryBytes = decode(payload);
  console.log('Captured query bytes (' + queryBytes.length + '):', queryBytes.join(','));
  
  // Extract fixed part (bytes 4 onwards)
  const fixedPart = queryBytes.slice(4); // [1, 0, ...30 bytes]
  console.log('Fixed part (' + fixedPart.length + ' bytes):', fixedPart.join(','));
  
  // Generate a new query with random first 4 bytes
  function generateQuery() {
    const random4 = [
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
      Math.floor(Math.random() * 256),
    ];
    const allBytes = [...random4, ...fixedPart];
    return '0' + encode(allBytes, basestr);
  }
  
  // Test: POST with generated query
  function httpPost(url, cookie, body) {
    return new Promise(r => {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
          'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
          'Cookie': cookie,
          'Content-Length': Buffer.byteLength(body),
        }
      }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b })); });
      req.on('error', e => r({ status: 'ERR', error: e.message }));
      req.write(body); req.end();
    });
  }
  
  const baseUrl = 'https://pmos.xj.sgcc.com.cn:20080';
  
  // Test 1: POST with original captured query
  const r1 = await httpPost(baseUrl + '/px-gateway/GatewayConfig/getGatewayConfig?r20SZOQm=' + capturedQuery, cookieHeader, '{}');
  console.log('\nOriginal query:', r1.status, r1.body.substring(0, 100));
  
  // Test 2: POST with generated query (random 4 bytes + fixed part)
  const genQuery = generateQuery();
  console.log('Generated query:', genQuery.substring(0, 30) + '...');
  const r2 = await httpPost(baseUrl + '/px-gateway/GatewayConfig/getGatewayConfig?r20SZOQm=' + genQuery, cookieHeader, '{}');
  console.log('Generated query:', r2.status, r2.body.substring(0, 100));
  
  // Test 3: Another generated query
  const genQuery2 = generateQuery();
  const r3 = await httpPost(baseUrl + '/px-gateway/GatewayConfig/getGatewayConfig?r20SZOQm=' + genQuery2, cookieHeader, '{}');
  console.log('Generated query 2:', r3.status, r3.body.substring(0, 100));
  
  // Test 4: POST to a different endpoint with generated query
  const genQuery3 = generateQuery();
  const r4 = await httpPost(baseUrl + '/px-common-authority/marketMapping/selectByCondition?r20SZOQm=' + genQuery3, cookieHeader, '{}');
  console.log('Diff endpoint:', r4.status, r4.body.substring(0, 100));
  
  // Test 5: POST with query to same endpoint multiple times
  for (let i = 0; i < 3; i++) {
    const q = generateQuery();
    const r = await httpPost(baseUrl + '/px-gateway/GatewayConfig/getGatewayConfig?r20SZOQm=' + q, cookieHeader, '{}');
    console.log('Replay ' + i + ':', r.status, r.body.substring(0, 60));
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
