/**
 * 818_capture_c4.js
 * hook VM 主解释器 _$c4：记录每个 program 调用 + 输出数组（找 base 生成 program）
 * 方法：在 eval 生成的 VM JS 中，_$c4 是主解释器（225KB）
 * 用 addInitScript hook + 轮询，捕获 _$c4 的 program 和输出
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

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

  // 注入：hook 所有函数调用，捕获 VM 周期（用 Proxy 或轮询）
  // 更可靠：hook JSON.stringify？不
  // 方案：监控 $_ts 对象（VM 输出到 $_ts）
  // VM 生成 base 后存到 $_ts 或返回
  // 用 MutationObserver 监控 window._$ts 变化
  await page.addInitScript(() => {
    window.__cap = null;
    window.__base = null;
    // 监控 $_ts 对象
    const origDefine = Object.defineProperty;
    // 轮询检查 $_ts
    window.__check = setInterval(() => {
      try {
        const ts = window._$ts;
        if (ts && ts.aebi && !window.__cap) {
          window.__cap = Array.from(ts.aebi);
          window.__capLen = ts.aebi.length;
        }
        if (ts && ts.__base && !window.__base) {
          window.__base = Array.from(ts.__base);
          window.__baseLen = ts.__base.length;
        }
      } catch (e) {}
    }, 100);
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));

  const res = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({cap: window.__cap ? Array.from(window.__cap).slice(0, 12) : [], capLen: window.__capLen || 0, base: window.__base ? Array.from(window.__base).slice(0, 12) : [], baseLen: window.__baseLen || 0, tsKeys: window._$ts ? Object.keys(window._$ts) : []})', returnByValue: true });
  console.log('[2] 捕获结果:', res.result?.value);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });