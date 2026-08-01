/**
 * 311_node_proxy_api.js
 *
 * Node https CONNECT 代理 + 浏览器 cookie + 捕获 query → API
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

function proxyRequest(url, headers, method, body, timeout = 30000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const proxyHost = '140.249.234.175', proxyPort = 2022;
    const proxyAuth = 'Basic ' + Buffer.from('74940609:aFmWc5Fs').toString('base64');
    const sock = net.connect(proxyPort, proxyHost, () => {
      sock.write(`CONNECT ${u.hostname}:${u.port} HTTP/1.1\r\nHost: ${u.hostname}:${u.port}\r\nProxy-Authorization: ${proxyAuth}\r\n\r\n`);
    });
    sock.on('data', function onData(d) {
      const str = d.toString();
      if (str.includes('200 Connection established')) {
        sock.removeListener('data', onData);
        const tlsSock = tls.connect({ socket: sock, servername: u.hostname, rejectUnauthorized: false }, () => {
          const reqHeaders = {
            'User-Agent': UA, ...headers,
            'Host': u.hostname,
            'Content-Length': body ? Buffer.byteLength(body) : 0,
            'Connection': 'close',
          };
          tlsSock.write(`${method} ${u.pathname}${u.search} HTTP/1.1\r\n` + Object.entries(reqHeaders).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n' + (body || ''));
        });
        let respData = '';
        let headersDone = false;
        let status = 0;
        let respHeaders = '';
        tlsSock.on('data', (d2) => {
          respData += d2.toString('latin1');
          if (!headersDone) {
            const idx = respData.indexOf('\r\n\r\n');
            if (idx >= 0) {
              headersDone = true;
              const head = respData.substring(0, idx);
              respHeaders = head;
              const m = head.match(/^HTTP\/1\.\d (\d+)/);
              status = m ? +m[1] : 0;
              respData = respData.substring(idx + 4);
            }
          }
        });
        tlsSock.on('end', () => resolve({ status, data: respHeaders + ' | BODY:' + respData.substring(0, 100) }));
        tlsSock.on('error', (e) => resolve({ status: 'ERR', data: e.message.substring(0, 60) }));
      }
    });
    sock.on('error', (e) => resolve({ status: 'SOCKERR', data: e.message.substring(0, 60) }));
    setTimeout(() => resolve({ status: 'TIMEOUT', data: '' }), timeout);
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let pCookie = '', pCookieName = '', oCookie = null;
  let apiCapture = null;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url;
      if (url.includes('/px-gateway/') && !apiCapture) apiCapture = url;
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(6000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(15000);
    await cdp.send('Runtime.evaluate', { expression: `fetch('/px-gateway/GatewayConfig/getGatewayConfig',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})` });
    await page.waitForTimeout(5000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pCookieName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    const cookieStr = (oCookie ? oCookie.name + '=' + oCookie.value + '; ' : '') + pCookieName + '=' + pCookie;

    console.log('=== Node https（CONNECT 代理）===');
    let r = await proxyRequest(TARGET, { Cookie: cookieStr, 'Accept': 'text/html,application/xhtml+xml' }, 'GET');
    console.log('页面 GET:', r.status, r.data.includes('SafeLine') ? 'WAF' : r.data.substring(0, 60));
    if (apiCapture) {
      r = await proxyRequest(apiCapture, { Cookie: cookieStr, 'Content-Type': 'application/json', Referer: TARGET, Origin: TARGET.replace(/\/$/, ''), Accept: 'application/json, text/plain, */*' }, 'POST', '{}');
      console.log('API 捕获 query:', r.status, r.data.includes('SafeLine') ? 'WAF' : r.data.substring(0, 60));
    }
    r = await proxyRequest(API, { Cookie: cookieStr, 'Content-Type': 'application/json', Referer: TARGET, Origin: TARGET.replace(/\/$/, '') }, 'POST', '{}');
    console.log('API 无 query:', r.status, r.data.includes('SafeLine') ? 'WAF' : r.data.substring(0, 60));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
