/**
 * 310_node_https_api.js
 *
 * Node https 请求 API（浏览器 cookie + 捕获 query）→ 判断 WAF 是否拦截 Node TLS
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

function nodeRequest(url, headers, method, body) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers, rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data: data.substring(0, 80) }));
    });
    req.on('error', (e) => resolve({ status: 'ERR', data: e.message.substring(0, 50) }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 'TIMEOUT', data: '' }); });
    if (body) req.write(body);
    req.end();
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
    console.log('cookie:', cookieStr.substring(0, 80));

    // Node https 页面 GET
    console.log('\n=== Node https ===');
    let r = await nodeRequest(TARGET, { 'User-Agent': UA, Cookie: cookieStr }, 'GET');
    console.log('页面 GET:', r.status, r.data.includes('SafeLine') ? 'WAF' : r.data.substring(0, 40));
    // Node https API（捕获 query）
    if (apiCapture) {
      r = await nodeRequest(apiCapture, { 'User-Agent': UA, Cookie: cookieStr, 'Content-Type': 'application/json', Referer: TARGET, Origin: TARGET.replace(/\/$/, '') }, 'POST', '{}');
      console.log('API 捕获 query:', r.status, r.data.includes('SafeLine') ? 'WAF' : r.data.substring(0, 40));
    }
    r = await nodeRequest(API, { 'User-Agent': UA, Cookie: cookieStr, 'Content-Type': 'application/json', Referer: TARGET, Origin: TARGET.replace(/\/$/, '') }, 'POST', '{}');
    console.log('API 无 query:', r.status, r.data.includes('SafeLine') ? 'WAF' : r.data.substring(0, 40));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
