/**
 * 03_capture_cd_query.js
 *
 * 安全版捕获：零函数包装，只捕获
 *   1. 412 挑战页 nsd/cd（同会话）
 *   2. 每个请求的 query 值
 *   3. 触发多个同步 XHR（GET/POST 不同 URL）
 *   4. 另捕获 O/P cookie（context.cookies）
 *
 * 输出：cd + query 解码（session/request 段）
 * 之后用管线从 cd 推导 keys16/17/2 测试 request_data 解密
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

function decodeQuery(query) {
  const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const payload = query.startsWith('0') ? query.slice(1) : query;
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 1 < payload.length) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]];
    bytes.push((c0 << 2) | (c1 >> 4));
  }
  return bytes;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  let challenge = null;
  page.on('response', async (resp) => {
    if (challenge) return;
    if (resp.status() === 412) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? parseInt(nsdM[1]) : null, cd: cdM ? cdM[1] : null, bodyLen: body.length };
        console.log('[challenge] nsd=' + challenge.nsd + ' cdLen=' + (challenge.cd || '').length);
      } catch (e) { console.log('[challenge] err:', e.message); }
    }
  });

  const queryRequests = [];
  cdp.on('Network.requestWillBeSent', (params) => {
    const m = params.request.url.match(/r20SZOQm=([^&]+)/);
    if (m) queryRequests.push({ path: params.request.url.split('?')[0], query: m[1], method: params.request.method, ts: Date.now() });
  });

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  const test = await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  console.log('[3] 验证 GET:', test.result.value);

  // 触发多请求
  console.log('\n[4] 触发多请求...');
  const REQS = [
    { method: 'POST', url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { method: 'GET', url: '/px-gateway/GatewayConfig/security', body: null },
    { method: 'POST', url: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
    { method: 'POST', url: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{"a":1}' },
    { method: 'GET', url: '/px-gateway/GatewayConfig/security', body: null },
    { method: 'POST', url: '/px-common-authcenter/auth/v2/verifyType/get', body: '{}' },
  ];
  for (let ri = 0; ri < REQS.length; ri++) {
    const r = REQS[ri];
    const trig = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var x = new XMLHttpRequest();
          x.open('${r.method}', '${r.url}', false);
          x.setRequestHeader('Content-Type', 'application/json');
          x.send(${r.body === null ? 'null' : "'" + r.body + "'"});
          return JSON.stringify({ status: x.status, q: (x.responseURL || '').indexOf('r20SZOQm=') >= 0 });
        } catch(e) { return e.message; }
      })()`,
      returnByValue: true,
    });
    console.log('  [' + ri + '] ' + r.method + ' ' + r.url + ' → ' + trig.result.value);
    await page.waitForTimeout(800);
  }

  // 捕获 P/O cookie
  const cookies = await context.cookies();
  const pCookie = cookies.find(c => c.name.endsWith('P'))?.value || null;
  const oCookie = cookies.find(c => c.name.endsWith('O'))?.value || null;

  const out = {
    capturedAt: Date.now(),
    challenge,
    pCookie: pCookie ? pCookie.substring(0, 60) + '...' : null,
    oCookie: oCookie ? oCookie.substring(0, 60) + '...' : null,
    cookieNames: cookies.map(c => c.name),
    queryRequests,
    decodedQueries: queryRequests.map(q => {
      const bytes = decodeQuery(q.query);
      return {
        path: q.path, method: q.method, query: q.query, bytes,
        crc: bytes.slice(0, 4),
        session: bytes.slice(7, 55),
        request: bytes.slice(56, 88),
        sessionHex: bytes.slice(7, 55).map(b => b.toString(16).padStart(2, '0')).join(' '),
        requestHex: bytes.slice(56, 88).map(b => b.toString(16).padStart(2, '0')).join(' '),
      };
    }),
  };
  const fname = path.join(OUT, 'cd_query_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('\n=== 保存:', fname);
  console.log('query 数:', out.decodedQueries.length);
  if (out.decodedQueries.length > 0) {
    console.log('session:', out.decodedQueries[0].sessionHex);
    console.log('request[0]:', out.decodedQueries[0].requestHex);
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
