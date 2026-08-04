/**
 * 728_A134_network_diag.js
 * 诊断：route 拦截模式下页面实际加载了什么（网络请求 + console）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';

(async () => {
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') console.log('CONSOLE:', msg.text().substring(0, 150)); });
  page.on('requestfailed', (req) => console.log('REQFAIL:', req.url().substring(0, 100), req.failure()?.errorText));
  page.on('response', (res) => { if (res.status() >= 400) console.log('RESP:', res.status(), res.url().substring(0, 100)); });

  await page.route('**', async (route) => {
    const url = route.request().url();
    if (url === TARGET) {
      await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
      return;
    }
    await route.continue().catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 20000));
  const ck = await context.cookies();
  console.log('[2] cookies:', ck.filter(c => /[OP]$/.test(c.name)).map(c => `${c.name}=len${c.value.length}`).join(' '));
  const doc = await cdp_safe(page, 'document.readyState');
  console.log('[3] readyState:', doc);
  await browser.close();
  process.exit(0);

  async function cdp_safe(pg, expr) {
    try {
      const cdp2 = await context.newCDPSession(pg);
      const r = await cdp2.send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.value;
    } catch (e) { return 'ERR:' + e.message.substring(0, 50); }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
