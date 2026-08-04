/**
 * 728_A154_full_plain_capture.js
 * 捕获完整明文 basearr（182 全量数组）+ P cookie
 * 验证：明文 → huffman 加密 → encryptMode2 → cookie be 闭环
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

  // 捕获最大长度的 113 开头数组（明文 basearr 全量）
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113) ? (window.__cap113 = Array.from(this), true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'window.__cap113 ? JSON.stringify({len:window.__cap113.length, arr:window.__cap113}) : "null"', returnByValue: true });
  if (r.result?.value && r.result.value !== 'null') {
    const d = JSON.parse(r.result.value);
    console.log('[2] 明文 basearr len:', d.len);
    console.log('head:', d.arr.slice(0, 32).join(','));
    console.log('tail:', d.arr.slice(-8).join(','));
    fs.writeFileSync('/tmp/nx_browser_plain_full.json', JSON.stringify({ len: d.len, arr: d.arr }));
  } else console.log('[2] 未捕获 113');
  const ck = await context.cookies();
  const p = ck.find(c => /P$/.test(c.name));
  if (p) { fs.writeFileSync('/tmp/nx_browser_P_full.txt', p.value); console.log('P cookie len:', p.value.length); }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
