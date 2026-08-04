/**
 * 调试3：检查外层 js 是否加载、$_ts 内容、P cookie 生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const http = require('http');
const tls = require('tls');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_EXT = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_EXT_AUTH = 'Basic ' + Buffer.from(PROXY_EXT.username + ':' + PROXY_EXT.password).toString('base64');
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';

function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_EXT.hostname, port: +PROXY_EXT.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_EXT_AUTH, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) resolve({ status: parseInt((raw.substring(0, headEnd).split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4) });
        else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) process.exit(1);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  console.log('nsd:', m[1], 'cd len:', m[2].length);

  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  await context.addCookies([{ name: '3RKyaeh47p90O', value: 'x', domain: 'pmos.nx.sgcc.com.cn', path: '/', secure: true }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  const failedReqs = [];
  page.on('requestfailed', r => failedReqs.push(r.url().substring(0, 120) + ' :: ' + (r.failure()?.errorText || '')));
  page.on('response', r => { if (r.status() >= 400) failedReqs.push('HTTP' + r.status() + ' ' + r.url().substring(0, 120)); });
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      route.fulfill({ status: 412, contentType: 'text/html', headers: { 'Set-Cookie': '3RKyaeh47p90O=test; Path=/; Secure; HttpOnly' }, body: ch.body }).catch(() => {});
    } else route.continue().catch(() => {});
  });
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(e => console.log('goto err', e.message.substring(0, 80)));
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const ev = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ts:Object.keys(window.$_ts||{}).length, base:window.__basearr?window.__basearr.length:null})', returnByValue: true });
    const ck = await context.cookies();
    const p = ck.find(c => /P$/.test(c.name));
    console.log(`t+${(i + 1) * 5}s tsKeys=${ev.result?.value} P=${p ? 'len' + p.value.length : 'none'}`);
    if (p) break;
  }
  console.log('failed requests:', failedReqs.join('\n  ') || 'none');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
