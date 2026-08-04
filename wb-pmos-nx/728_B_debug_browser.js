/**
 * 调试：浏览器能否走到 412 页面 + 捕获 push
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
  console.log('412 status:', ch.status);
  if (ch.status !== 412) process.exit(1);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  console.log('nsd:', m[1], 'cd len:', m[2].length);

  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: 'http://127.0.0.1:9000' },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  await context.addCookies([{ name: '3RKyaeh47p90O', value: 'x', domain: 'pmos.nx.sgcc.com.cn', path: '/', secure: true }]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/*', (route) => {
    if (route.request().resourceType() === 'document') {
      console.log('route document fulfill');
      route.fulfill({ status: 412, contentType: 'text/html', headers: { 'Set-Cookie': '3RKyaeh47p90O=test; Path=/; Secure; HttpOnly' }, body: ch.body }).catch(e => console.log('fulfill err', e.message));
    } else route.continue().catch(() => {});
  });
  let pushCount = 0;
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 138 && this.length <= 152 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
  });
  cdp.on('Debugger.paused', async (params) => {
    pushCount++;
    console.log('paused #', pushCount);
    await cdp.send('Debugger.resume').catch(() => {});
  });
  try {
    const resp = await page.goto(TARGET, { timeout: 40000, waitUntil: 'domcontentloaded' });
    console.log('goto done, status:', resp ? resp.status() : 'null');
  } catch (e) {
    console.log('goto err:', e.message.substring(0, 100));
  }
  await new Promise(r => setTimeout(r, 20000));
  const ev = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__basearr)', returnByValue: true });
  console.log('__basearr:', ev.result?.value?.substring(0, 200) || 'null');
  const ck = await context.cookies();
  console.log('cookies:', ck.map(c => c.name).join(','));
  const p = ck.find(c => /P$/.test(c.name));
  console.log('P:', p ? 'len ' + p.value.length : 'none');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
