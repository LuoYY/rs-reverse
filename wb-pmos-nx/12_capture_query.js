/**
 * 12_capture_query.js
 *
 * 浏览器捕获 nx 站点的 query（MurR7rxG=...）与 cookie，供离线推导 basestr / query 结构
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

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 触发多个请求，捕获 query
  console.log('触发请求捕获 query...');
  const queries = [];
  const urls = [
    ['POST', '/px-gateway/GatewayConfig/getGatewayConfig', '{}'],
    ['GET', '/px-gateway/GatewayConfig/security', null],
    ['POST', '/px-common-authcenter/auth/v2/captcha/get', '{}'],
  ];
  for (const [m, u, b] of urls) {
    const trig = await cdp.send('Runtime.evaluate', {
      expression: `(function(){try{var x=new XMLHttpRequest();x.open('${m}','${u}',false);x.setRequestHeader('Content-Type','application/json');x.send(${b === null ? 'null' : "'" + b + "'"});return JSON.stringify({status:x.status,url:x.responseURL})}catch(e){return e.message}})()`,
      returnByValue: true,
    });
    let d;
    try { d = JSON.parse(trig.result.value); } catch (e) { d = { status: trig.result.value }; }
    console.log(' ', m, u, '→', d.status);
    if (d.url) {
      const qm = d.url.match(/[?&]([^=]+)=([^&]+)/);
      if (qm) queries.push({ m, u, param: qm[1], query: decodeURIComponent(qm[2]) });
    }
    await page.waitForTimeout(1000);
  }

  // 读页面内实际发送的请求 URL（通过性能资源）
  const resR = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var out = [];
      if (window.performance && performance.getEntriesByType) {
        performance.getEntriesByType('resource').forEach(function(e) {
          if (e.name && e.name.indexOf('MurR7rxG') >= 0) out.push(e.name);
        });
      }
      return JSON.stringify(out.slice(-5));
    })()`,
    returnByValue: true,
  });
  console.log('\n资源 URL 中的 query:');
  try {
    const resUrls = JSON.parse(resR.result.value);
    resUrls.forEach(u => {
      const qm = u.match(/[?&]([^=]+)=([^&]+)/);
      if (qm) queries.push({ u, param: qm[1], query: decodeURIComponent(qm[2]) });
      console.log(' ', u.substring(0, 120));
    });
  } catch (e) {}

  const cookies = await context.cookies();
  const out = {
    capturedAt: Date.now(), challenge,
    queries,
    cookies: cookies.map(c => ({ name: c.name, value: c.value })),
  };
  const fname = path.join(OUT, 'query_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('\n已保存:', fname, 'queries:', queries.length);

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
