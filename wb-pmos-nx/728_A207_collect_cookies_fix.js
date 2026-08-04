/**
 * 728_A207_collect_cookies_fix.js
 * 修复 cookie 采集：更长等待 + 轮询 document.cookie + context.cookies
 * route 拦截模式下确保 O/P cookie 生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.route('**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    try {
      if (pathname === '/') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
      const file = path.join(MOCK_DIR, pathname);
      if (fs.existsSync(file)) {
        await route.fulfill({ status: 200, contentType: pathname.endsWith('.js') ? 'application/javascript' : 'text/plain', body: fs.readFileSync(file, 'utf8') });
        return;
      }
    } catch (e) {}
    await route.continue().catch(() => {});
  });
  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  // 轮询 cookie
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const cookies = await context.cookies();
    const names = cookies.map(c => c.name).join(',');
    console.log(`[${(i + 1) * 5}s] cookie: ${names || 'none'}`);
    if (cookies.some(c => /O$/.test(c.name)) && cookies.some(c => /P$/.test(c.name))) break;
  }
  const cookies = await context.cookies();
  const all = {};
  for (const c of cookies) all[c.name] = c.value;
  fs.writeFileSync('/tmp/nx_browser_cookies_full.json', JSON.stringify(all, null, 1));
  const oCk = cookies.find(c => /O$/.test(c.name));
  const pCk = cookies.find(c => /P$/.test(c.name));
  console.log('O:', oCk ? oCk.name + ' len=' + oCk.value.length : 'none');
  console.log('P:', pCk ? pCk.name + ' len=' + pCk.value.length : 'none');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
