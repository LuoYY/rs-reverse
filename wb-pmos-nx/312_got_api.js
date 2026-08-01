/**
 * 312_got_api.js
 *
 * got + 代理 + 浏览器 cookie/query → API 测试（Node TLS 是否通过 WAF）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

(async () => {
  const got = require('got');
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

    const proxyOpts = { protocol: 'http:', host: '140.249.234.175', port: 2022, username: '74940609', password: 'aFmWc5Fs' };

    console.log('=== got（Node TLS）===');
    try {
      const r = await got.get(TARGET, { https: { rejectUnauthorized: false }, proxy: proxyOpts, headers: { 'User-Agent': UA, Cookie: cookieStr }, timeout: { request: 30000 } });
      console.log('页面 GET:', r.statusCode, (r.body || '').includes('SafeLine') ? 'WAF' : 'OK');
    } catch (e) { console.log('页面 GET ERR:', e.message.substring(0, 50)); }
    if (apiCapture) {
      try {
        const r = await got.post(apiCapture, { https: { rejectUnauthorized: false }, proxy: proxyOpts, headers: { 'User-Agent': UA, Cookie: cookieStr, 'Content-Type': 'application/json', Referer: TARGET, Origin: TARGET.replace(/\/$/, '') }, body: '{}', timeout: { request: 30000 } });
        console.log('API 捕获 query:', r.statusCode, (r.body || '').includes('SafeLine') ? 'WAF' : (r.body || '').substring(0, 60));
      } catch (e) { console.log('API 捕获 query ERR:', e.message.substring(0, 50)); }
    }
    try {
      const r = await got.post(API, { https: { rejectUnauthorized: false }, proxy: proxyOpts, headers: { 'User-Agent': UA, Cookie: cookieStr, 'Content-Type': 'application/json', Referer: TARGET, Origin: TARGET.replace(/\/$/, '') }, body: '{}', timeout: { request: 30000 } });
      console.log('API 无 query:', r.statusCode, (r.body || '').includes('SafeLine') ? 'WAF' : (r.body || '').substring(0, 60));
    } catch (e) { console.log('API 无 query ERR:', e.message.substring(0, 50)); }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
