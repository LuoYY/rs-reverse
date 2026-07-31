/**
 * 39_capture_request_details.js
 *
 * 抓浏览器 XHR 请求的完整 header + 协议 + TLS 细节
 * 用于精确模拟
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');

  // 记录 XHR 请求详情
  const requests = [];
  cdp.on('Network.requestWillBeSent', (p) => {
    if (p.request.url.includes('GatewayConfig')) {
      requests.push({
        url: p.request.url,
        method: p.request.method,
        headers: p.request.headers,
        protocol: p.wallTime ? 'h2' : '?',
      });
    }
  });

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 触发 XHR
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('XHR status:', trig.result.value);

  // 协议细节（CDP 有 connectionType 等）
  const tt = await cdp.send('Network.enable');
  console.log('\n=== 请求详情 ===');
  requests.forEach((r, i) => {
    console.log('[' + i + '] ' + r.method + ' ' + r.url.substring(0, 80));
    console.log('  headers:');
    for (const [k, v] of Object.entries(r.headers)) {
      console.log('    ' + k + ': ' + (v.length > 80 ? v.substring(0, 80) + '...' : v));
    }
  });

  // TLS 信息（通过 getSecurityInfo 太重，用 TCP 连接信息）
  const cookies = await context.cookies();
  fs.writeFileSync(path.join(OUT, 'req_details_' + Date.now() + '.json'), JSON.stringify({
    capturedAt: Date.now(), requests, cookies: cookies.map(c => ({ name: c.name, value: c.value })),
  }, null, 2));
  console.log('\n已保存');

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
