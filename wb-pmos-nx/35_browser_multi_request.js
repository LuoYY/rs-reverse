/**
 * 35_browser_multi_request.js
 *
 * 浏览器内连续发多个请求，观察：
 *   - cookie 是否持续有效（200）
 *   - O/P cookie 是否变化
 *   - query 是否每次变化
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
  await cdp.send('Runtime.enable');

  let challenge = null;
  const cookiesSnap = [];
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

  console.log('加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 连续发 5 个请求
  console.log('\n=== 浏览器内连续请求 ===');
  for (let i = 0; i < 5; i++) {
    const trig = await cdp.send('Runtime.evaluate', {
      expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return JSON.stringify({status:x.status,url:x.responseURL})}catch(e){return e.message}})()`,
      returnByValue: true,
    });
    let d;
    try { d = JSON.parse(trig.result.value); } catch (e) { d = { status: trig.result.value }; }
    const qm = d.url ? d.url.match(/[?&]([^=]+)=([^&]+)/) : null;
    const query = qm ? decodeURIComponent(qm[2]) : '';
    const cookies = await context.cookies();
    const oc = cookies.find(c => c.name.endsWith('O'));
    const pc = cookies.find(c => c.name.endsWith('P'));
    console.log('[' + i + '] status=' + d.status + ' query前20=' + query.substring(0, 20) + '... O=' + (oc ? oc.value.length : 0) + ' P=' + (pc ? pc.value.length : 0));
    await page.waitForTimeout(1500);
  }

  // cookie 快照对比
  const cookies = await context.cookies();
  console.log('\ncookies:');
  cookies.forEach(c => console.log('  ' + c.name + '=' + c.value.substring(0, 40) + '... len=' + c.value.length));
  console.log('challenge:', challenge ? 'nsd=' + challenge.nsd : 'null');

  // 保存
  fs.writeFileSync(path.join(OUT, 'multi_' + Date.now() + '.json'), JSON.stringify({
    capturedAt: Date.now(), challenge, cookies: cookies.map(c => ({ name: c.name, value: c.value })),
  }, null, 2));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
