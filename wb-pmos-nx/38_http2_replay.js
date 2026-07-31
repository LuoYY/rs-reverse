/**
 * 38_http2_replay.js
 *
 * 用 HTTP/2 重放浏览器 cookie（Node http2 模块）
 * 验证：412 是否因 HTTP/1.1 vs HTTP/2 差异
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const http2 = require('http2');

const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

async function main() {
  // 读 multi 捕获
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('multi_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const oc = d.cookies.find(c => c.name.endsWith('O'));
  const pc = d.cookies.find(c => c.name.endsWith('P'));
  const cookieStr = `${oc.name}=${oc.value}; ${pc.name}=${pc.value}`;
  console.log('cookie:', cookieStr.substring(0, 40) + '...');

  const tls = require('tls');
  const client = http2.connect(TARGET, {
    rejectUnauthorized: false,
    createConnection: (opts) => tls.connect({
      ...opts,
      ALPNProtocols: ['h2', 'http/1.1'],
      servername: 'pmos.nx.sgcc.com.cn',
      rejectUnauthorized: false,
    }),
  });
  client.on('error', (e) => { console.log('[h2 session error]', e.message); });

  function request(headers) {
    return new Promise((resolve) => {
      const req = client.request(headers);
      let body = '';
      let status = 0;
      req.on('response', (hdrs) => { status = hdrs[':status']; });
      req.on('data', c => body += c);
      req.on('end', () => resolve({ status, body }));
      req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
      req.end();
    });
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  // 1. HTTP/2 无 cookie
  const r0 = await request({ ':method': 'GET', ':path': '/', ':authority': 'pmos.nx.sgcc.com.cn:10443', 'user-agent': UA, 'accept': '*/*' });
  console.log('[HTTP/2] 无 cookie →', r0.status);

  // 2. HTTP/2 带 cookie
  const r1 = await request({ ':method': 'GET', ':path': '/', ':authority': 'pmos.nx.sgcc.com.cn:10443', 'user-agent': UA, 'accept': '*/*', 'cookie': cookieStr });
  console.log('[HTTP/2] O+P →', r1.status, 'len=' + r1.body.length);

  // 3. HTTP/2 带 cookie + 常见 header 顺序
  const r2 = await request({
    ':method': 'GET', ':path': '/', ':authority': 'pmos.nx.sgcc.com.cn:10443',
    'user-agent': UA,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'cookie': cookieStr,
  });
  console.log('[HTTP/2] O+P + 完整 header →', r2.status);

  // 4. 业务请求 POST（HTTP/2 + cookie）
  const r3 = await request({
    ':method': 'POST', ':path': '/px-gateway/GatewayConfig/getGatewayConfig', ':authority': 'pmos.nx.sgcc.com.cn:10443',
    'user-agent': UA,
    'content-type': 'application/json',
    'accept': 'application/json, text/plain, */*',
    'cookie': cookieStr,
  });
  console.log('[HTTP/2] POST 业务 →', r3.status, r3.body.substring(0, 80));

  client.close();
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
