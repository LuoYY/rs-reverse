/**
 * 819_inject_trace.js
 * 注入式 trace：在 VM 执行时捕获 base 生成
 * 关键：eval 生成的 JS 结尾有 $_ts.scj + $_ts.aebi 处理
 * 但 base(179) 不在 $_ts 直接可见 → 需要更深的 hook
 * 方法：hook eval 后的执行，捕获 VM 生成的 cookie
 * 观察：P cookie 在 window 上（document.cookie 或 location）
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

  // 注入：捕获 eval 生成的 JS + 执行后的 $_ts 状态 + cookie
  await page.addInitScript(() => {
    window.__trace = { evals: [], ts: null, cookie: null };
    const origEval = window.eval;
    window.eval = function (code) {
      try {
        if (typeof code === 'string') {
          window.__trace.evals.push({ len: code.length, head: code.substring(0, 80), t: Date.now() });
          if (window.__trace.evals.length > 10) window.__trace.evals.shift();
        }
      } catch (e) {}
      return origEval(code);
    };
    // 轮询捕获 $_ts 和 cookie
    window.__poll = setInterval(() => {
      try {
        if (window._$ts && !window.__trace.ts) {
          window.__trace.ts = JSON.parse(JSON.stringify(window._$ts));
          window.__trace.tsKeys = Object.keys(window._$ts);
        }
      } catch (e) {}
      try {
        const ck = document.cookie;
        if (ck && ck.includes('P=') && !window.__trace.cookie) {
          window.__trace.cookie = ck.substring(0, 200);
        }
      } catch (e) {}
    }, 100);
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));

  const res = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({evals: (window.__trace.evals||[]).map(e => ({len: e.len, head: e.head})), tsKeys: window.__trace.tsKeys || [], cookie: window.__trace.cookie || null, ts: window.__trace.ts})', returnByValue: true });
  const v = res.result?.value;
  console.log('[2] trace 结果:', String(v).substring(0, 2000));
  fs.writeFileSync('/tmp/nx_trace.json', v);
  console.log('[3] 已保存 /tmp/nx_trace.json');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });