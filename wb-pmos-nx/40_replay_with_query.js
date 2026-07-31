/**
 * 40_replay_with_query.js
 *
 * 用浏览器真实 query（MurR7rxG header）+ cookie 在 Node 重放
 * 验证：之前的 412 是否只是缺 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, 'captures');
const TARGET_HOST = 'pmos.nx.sgcc.com.cn';
const PORT = 10443;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function request(opts) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: TARGET_HOST, port: PORT, rejectUnauthorized: false,
      method: opts.method || 'GET',
      path: opts.path || '/',
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Referer': 'https://pmos.nx.sgcc.com.cn:10443/',
        ...opts.headers,
      },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
    req.end();
  });
}

async function main() {
  // 读取多请求捕获（含真实 query）
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('req_details_'));
  const f = files.sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const oc = d.cookies.find(c => c.name.endsWith('O'));
  const pc = d.cookies.find(c => c.name.endsWith('P'));
  const cookieStr = `${oc.name}=${oc.value}; ${pc.name}=${pc.value}`;
  // 第一个请求的 query
  const req0 = d.requests[0];
  const qm = req0.url.match(/[?&]([^=]+)=([^&]+)/);
  const paramName = qm[1];
  const query = decodeURIComponent(qm[2]);
  console.log('param:', paramName, 'query len:', query.length);

  // 1. 页面请求：cookie + query header
  const r1 = await request({
    path: '/',
    headers: { 'Cookie': cookieStr, [paramName]: query },
  });
  console.log('[页面] cookie+query header →', r1.status);

  // 2. 页面请求：cookie + query 在 URL
  const r2 = await request({
    path: '/?' + paramName + '=' + encodeURIComponent(query),
    headers: { 'Cookie': cookieStr },
  });
  console.log('[页面] cookie+query URL →', r2.status);

  // 3. 仅 cookie 无 query
  const r3 = await request({ path: '/', headers: { 'Cookie': cookieStr } });
  console.log('[页面] 仅 cookie →', r3.status);

  // 4. API 请求：cookie + query header
  const r4 = await request({
    method: 'POST',
    path: '/px-gateway/GatewayConfig/getGatewayConfig',
    headers: { 'Cookie': cookieStr, [paramName]: query, 'Content-Type': 'application/json' },
  });
  console.log('[API] cookie+query →', r4.status, r4.body.substring(0, 100));

  // 5. 新 query（同会话，重新生成——用浏览器第二个请求的 query）
  const req1 = d.requests[1];
  const qm1 = req1.url.match(/[?&]([^=]+)=([^&]+)/);
  const query2 = decodeURIComponent(qm1[2]);
  const r5 = await request({
    path: '/',
    headers: { 'Cookie': cookieStr, [paramName]: query2 },
  });
  console.log('[页面] cookie+query2 →', r5.status);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
