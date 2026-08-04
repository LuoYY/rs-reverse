/**
 * 728_A135_route_full.js
 * 完整 route 拦截（不依赖 reqable）：
 * - 挑战页 412 → fulfill（412.raw body）
 * - 外层 js → 本地读取 fulfill
 * 捕获 basearr 构造 + P cookie
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
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  await page.route('**', async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname;
    try {
      if (pathname === '/') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
      // 从 nx-mock 目录读取静态文件
      const file = path.join(MOCK_DIR, pathname);
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const ct = pathname.endsWith('.js') ? 'application/javascript' : 'text/plain';
        await route.fulfill({ status: 200, contentType: ct, body: content });
        return;
      }
    } catch (e) {}
    await route.continue().catch(() => {});
  });

  // 捕获 basearr 构造
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 130 && this.length <= 200 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;})) ? (function(){var a=Array.from(this);window.__arrs=window.__arrs||[];if(!window.__arrs.some(function(b){return b.length===a.length&&b[0]===a[0];})){window.__arrs.push(a);}return false;})() : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs.map(function(a){return {len:a.length, head:a.slice(0,8), tail:a.slice(-6)};})) : "null"', returnByValue: true });
  console.log('捕获数组摘要:', r.result?.value);
  const ck = await context.cookies();
  console.log('cookies:', ck.filter(c => /[OP]$/.test(c.name)).map(c => `${c.name}=len${c.value.length}`).join(' '));
  const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_all_arrays5.json', JSON.stringify({ arrs: JSON.parse(r2.result?.value || 'null') }, null, 1));
  console.log('已保存 /tmp/nx_browser_all_arrays5.json');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
