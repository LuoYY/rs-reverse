process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  // 注入 push hook（不干扰执行，仅记录）
  await page.addInitScript(() => {
    window.__captured = [];
    const origPush = Array.prototype.push;
    Array.prototype.push = function (...args) {
      const r = origPush.apply(this, args);
      if (this.length >= 100 && this.length <= 350 && typeof this[0] === 'number') {
        const h = this[0];
        if (h === 113 || h === 179 || h === 100) {
          try {
            const a = Array.from(this);
            window.__captured.push({ h, n: a.length, a: a.slice(0, 100) });
            if (window.__captured.length > 6) window.__captured = window.__captured.slice(-6);
          } catch (e) {}
        }
      }
      return r;
    };
  });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 25000));
  const cap = await page.evaluate(() => window.__captured || []);
  console.log('捕获数:', cap.length);
  cap.forEach((c, i) => console.log(i + ': h=' + c.h + ' n=' + c.n + ' 头20=' + c.a.slice(0, 20).map(x => x.toString(16).padStart(2, '0')).join(' ')));
  fs.writeFileSync('/tmp/nx_inject_captured.json', JSON.stringify(cap));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
