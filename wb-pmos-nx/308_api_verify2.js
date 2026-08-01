/**
 * 308_api_verify2.js
 *
 * 修复版：浏览器内 API 状态 + curl（旧代理 + retry）验证
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const PROXY_STR = 'http://74940609:aFmWc5Fs@140.249.234.175:2022';

function curlReq(cookieStr, url = TARGET, method = 'GET') {
  try {
    let cmd = `curl -x ${PROXY_STR} -k -sS -o /tmp/curl_out.txt -w "%{http_code}" --retry 3 --connect-timeout 20 --max-time 40 -A "${UA}" -H "Cookie: ${cookieStr}"`;
    if (method === 'POST') cmd += ` -H "Content-Type: application/json" -X POST -d '{}'`;
    cmd += ` "${url}"`;
    const code = execSync(cmd, { encoding: 'utf8' }).trim();
    const resp = fs.readFileSync('/tmp/curl_out.txt', 'utf8');
    return code + ' ' + (resp.includes('SafeLine') ? 'WAF' : resp.includes('DOCTYPE') ? 'HTML' : resp.substring(0, 60));
  } catch (e) { return 'ERR:' + e.message.substring(0, 40); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let challenge = null, pCookie = '', pCookieName = '', oCookie = null;
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
    page.on('response', async (resp) => {
      if (resp.status() === 412 && !challenge) {
        try {
          const body = await resp.text();
          const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
          const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
          challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
        } catch (e) {}
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) { console.log('goto:', e.message.substring(0, 40)); }
    await page.waitForTimeout(6000);
    try { await page.reload({ timeout: 90000 }); } catch (e) { console.log('reload:', e.message.substring(0, 40)); }
    await page.waitForTimeout(15000);
    // 浏览器内 API（fetch 异步）
    const r = await cdp.send('Runtime.evaluate', { expression: `fetch('/px-gateway/GatewayConfig/getGatewayConfig',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.status).then(s=>window.__apiStatus=s)`, awaitPromise: false });
    await page.waitForTimeout(5000);
    const s2 = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({status: window.__apiStatus, cookies: document.cookie.substring(0,50)})`, returnByValue: true });
    console.log('浏览器内 API status:', s2.result.value);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pCookieName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    const oStr = oCookie ? oCookie.name + '=' + oCookie.value : '';
    console.log('\n=== curl（旧代理）===');
    console.log('页面 GET:', curlReq(oStr + '; ' + pCookieName + '=' + pCookie, TARGET));
    if (apiCapture) console.log('API 捕获 query:', curlReq(oStr + '; ' + pCookieName + '=' + pCookie, apiCapture, 'POST'));
    console.log('API 无 query:', curlReq(oStr + '; ' + pCookieName + '=' + pCookie, API, 'POST'));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
