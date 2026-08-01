/**
 * 307_quick_api.js
 *
 * 采集后立即验证 API：
 * 1. 浏览器内 API 请求（状态记录）
 * 2. 立即用浏览器 cookie + 捕获 query → curl API
 * 3. 页面 GET 对比
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
const PROXY_STR = 'http://74940609:aFmWc5Fs@119.167.233.189:2018';

function curlReq(cookieStr, url = TARGET, method = 'GET') {
  try {
    let cmd = `curl -x ${PROXY_STR} -k -sS -o /tmp/curl_out.txt -w "%{http_code}" --connect-timeout 15 --max-time 30 -A "${UA}" -H "Cookie: ${cookieStr}"`;
    if (method === 'POST') cmd += ` -H "Content-Type: application/json" -X POST -d '{}'`;
    cmd += ` "${url}"`;
    const code = execSync(cmd, { encoding: 'utf8' }).trim();
    const resp = fs.readFileSync('/tmp/curl_out.txt', 'utf8');
    return code + ' ' + (resp.includes('SafeLine') ? 'WAF' : resp.substring(0, 50));
  } catch (e) { return 'ERR'; }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let challenge = null, pCookie = '', pCookieName = '', oCookie = null;
  let apiCapture = null, browserApiStatus = null;
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
    // 浏览器内 API（记录状态 + 响应）
    const r = await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return {status:x.status, len:x.responseText.length, head:x.responseText.substring(0,80)}}catch(e){return {status:0, err:e.message}})()`, returnByValue: true });
    browserApiStatus = JSON.stringify(r.result.value);
    console.log('浏览器内 API:', browserApiStatus);
    await page.waitForTimeout(3000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pCookieName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    // 立即 curl（采集后立即）
    const oStr = oCookie ? oCookie.name + '=' + oCookie.value : '';
    console.log('\n=== 立即 curl（采集后）===');
    console.log('页面 GET:', curlReq(oStr + '; ' + pCookieName + '=' + pCookie, TARGET));
    if (apiCapture) {
      console.log('API（捕获 query）:', curlReq(oStr + '; ' + pCookieName + '=' + pCookie, apiCapture, 'POST'));
    }
    console.log('API（无 query）:', curlReq(oStr + '; ' + pCookieName + '=' + pCookie, API, 'POST'));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
