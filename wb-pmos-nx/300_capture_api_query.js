/**
 * 300_capture_api_query.js
 *
 * patchright 采集 + 监听 API 请求（捕获 query 参数）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let challenge = null;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    const apiRequests = [];
    cdp.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url;
      if (url.includes('/px-gateway/')) {
        apiRequests.push({ url, headers: params.request.headers, postData: params.request.postData });
      }
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
    // 页面内 API 请求（多次尝试）
    for (let i = 0; i < 3; i++) {
      const r = await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return {status:x.status, resp:x.responseText.substring(0,200)}}catch(e){return {status:0, resp:e.message}})()`, returnByValue: true });
      console.log('API 尝试 ' + i + ':', JSON.stringify(r.result.value));
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(3000);
    console.log('\n=== API 请求捕获 ===');
    apiRequests.forEach((a, i) => console.log('[' + i + ']', a.url, '\n  headers.cookie:', (a.headers.cookie || '').substring(0, 100), '\n  postData:', a.postData));
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    const oc = cks.find(c => c.name.endsWith('O'));
    if (pc && oc) {
      fs.writeFileSync(path.join(OUT, 'api_capture_' + challenge.nsd + '.json'), JSON.stringify({
        nsd: challenge.nsd, cd: challenge.cd,
        oName: oc.name, oValue: oc.value, pName: pc.name, pValue: pc.value,
        apiRequests,
      }));
      console.log('已保存 api_capture_' + challenge.nsd + '.json');
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
