process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const reqs = [];
  page.on('request', r => reqs.push('REQ ' + r.url().substring(0, 100)));
  page.on('response', r => reqs.push('RESP:' + r.status() + ' ' + r.url().substring(0, 90)));
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 20000));
  const ck = await context.cookies();
  console.log('=== cookies ===');
  ck.forEach(c => console.log(c.name + ': len=' + c.value.length + ' head=' + c.value.substring(0, 30)));
  console.log('=== 请求 (后25) ===');
  reqs.slice(-25).forEach(r => console.log(r));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
