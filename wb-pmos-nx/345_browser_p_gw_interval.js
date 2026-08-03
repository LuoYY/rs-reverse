/**
 * 345_browser_p_gw_interval.js
 * 浏览器原 P + getGatewayConfig，间隔 70s → 区分 Node P(固定basearr) vs getGatewayConfig 窗口
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_STR = 'http://74940609:aFmWc5Fs@39.91.164.125:2018';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let pCookie = '', pName = '', oCookie = null;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    console.log('标题:', await page.evaluate(() => document.title).catch(() => ''), 'P长:', pCookie.length);

    const cookieStr = oCookie.name + '=' + oCookie.value + '; ' + pName + '=' + pCookie;
    const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';

    // 用浏览器原 cookie 重放（curl）
    function gwReq(label) {
      const cmd = `curl -s -o /tmp/345_gw.html -w "%{http_code}" -x "${PROXY_STR}" --max-time 20 -X POST '${API}' -H 'Content-Type: application/json;charset=UTF-8' -H 'ClientTag: OUTNET_BROWSE' -H 'CurrentRoute: /outNet' -H 'User-Agent: ${UA}' -b '${cookieStr}' -d '{}'`;
      try {
        const code = execSync(cmd, { timeout: 30000 }).toString().trim();
        const body = require('fs').readFileSync('/tmp/345_gw.html', 'utf8');
        console.log(label + ':', code, body.substring(0, 50).replace(/\n/g, ' '));
      } catch (e) { console.log(label + ' err:', e.message.substring(0, 80)); }
    }

    gwReq('#1 (t=0, 浏览器原P)');
    console.log('等 70s...');
    await sleep(70000);
    gwReq('#2 (t=70s, 浏览器原P)');
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
