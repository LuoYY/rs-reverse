/**
 * 309_api_full_headers.js
 *
 * curl API + 完整浏览器头（Referer/Origin/Accept）→ 判断 WAF 是否 TLS 指纹拦截
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

function curlReq(cookieStr, url, headers) {
  try {
    let cmd = `curl -x ${PROXY_STR} -k -sS -o /tmp/curl_out.txt -w "%{http_code}" --retry 2 --connect-timeout 20 --max-time 40`;
    for (const [k, v] of Object.entries(headers)) cmd += ` -H "${k}: ${v}"`;
    cmd += ` "${url}"`;
    const code = execSync(cmd, { encoding: 'utf8' }).trim();
    const resp = fs.readFileSync('/tmp/curl_out.txt', 'utf8');
    return code + ' ' + (resp.includes('SafeLine') ? 'WAF' : resp.includes('DOCTYPE') ? 'HTML' : resp.substring(0, 80));
  } catch (e) { return 'ERR:' + e.message.substring(0, 40); }
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
      if (url.includes('/px-gateway/') && !apiCapture) {
        apiCapture = url;
        fs.writeFileSync('/tmp/api_req.json', JSON.stringify(params.request));
      }
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
    const oStr = oCookie ? oCookie.name + '=' + oCookie.value : '';
    const cookieStr = oStr + '; ' + pCookieName + '=' + pCookie;

    // 浏览器真实请求头
    let browserHeaders = {};
    try { browserHeaders = JSON.parse(fs.readFileSync('/tmp/api_req.json', 'utf8')).headers; } catch (e) {}
    console.log('浏览器请求头:', JSON.stringify(browserHeaders).substring(0, 300));

    console.log('\n=== curl API 变体 ===');
    console.log('基础:', curlReq(cookieStr, apiCapture || API, { 'User-Agent': UA, 'Content-Type': 'application/json' }));
    console.log('+完整头:', curlReq(cookieStr, apiCapture || API, browserHeaders));
    console.log('+Referer/Origin:', curlReq(cookieStr, apiCapture || API, {
      'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': '*/*',
      'Origin': TARGET.replace(/\/$/, ''), 'Referer': TARGET,
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', 'Accept-Encoding': 'gzip, deflate, br',
    }));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
