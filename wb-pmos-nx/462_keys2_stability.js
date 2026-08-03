/**
 * 462_keys2_stability.js
 * 决定性实验：固定挑战页 HTML（同 nsd/cd），浏览器多次加载对比 P cookie
 * - P cookie 相同 → keys2=f(nsd,cd)（环境无关）→ 纯算法可行
 * - P cookie 不同 → keys2 依赖环境/随机 → 纯算法需环境模拟
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const PROXY = { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' };
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  // 1. 捕获挑战页 HTML
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无 nsd/cd'); process.exit(1); }
  const nsd = m[1];
  console.log('固定挑战页 nsd=' + nsd + ' (len=' + ch.body.length + ')');

  const browser = await chromium.launch({ headless: true, proxy: PROXY, args: ['--ignore-certificate-errors', '--no-sandbox'] });

  const cookies = [];
  for (let round = 1; round <= 3; round++) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
    const page = await context.newPage();
    // route 拦截：主文档返回固定挑战页 HTML
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => {
      route.fulfill({ status: 412, contentType: 'text/html', body: ch.body });
    });
    try {
      await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' });
    } catch (e) {}
    await page.waitForTimeout(7000);
    // 捕获 P cookie
    const ck = await context.cookies();
    const pCookie = ck.find(c => c.name.endsWith('P'));
    const oCookie = ck.find(c => c.name.endsWith('O'));
    console.log(`第 ${round} 轮: P=${pCookie ? pCookie.value.substring(0, 40) + '...(len=' + pCookie.value.length + ')' : '无'} O=${oCookie ? 'len=' + oCookie.value.length : '无'}`);
    if (pCookie) cookies.push(pCookie.value);
    await context.close();
  }

  // 对比
  console.log('\n=== 对比 ===');
  if (cookies.length >= 2) {
    console.log('P1==P2:', cookies[0] === cookies[1]);
    if (cookies.length >= 3) console.log('P2==P3:', cookies[1] === cookies[2]);
    // keys2 在 P cookie 里（解密后 dec.slice(15,63)），先对比 P cookie 整体
    console.log('结论:', cookies[0] === cookies[1] ? '★ keys2 稳定（环境无关，纯算法可行！）' : 'keys2 变化（依赖环境/随机）');
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
