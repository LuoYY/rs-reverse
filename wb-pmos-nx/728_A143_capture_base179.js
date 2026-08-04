/**
 * 728_A143_capture_base179.js
 * 捕获 base（179 开头，140-180 长度）构造调用栈
 * 同时捕获明文 basearr（113 开头）构造调用栈，对比两者 VM 位置
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

  // 捕获：179 开头（base）或 113 开头（明文），140-190 长度
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 140 && this.length <= 190 && typeof this[0] === "number") ? (this[0] === 179 ? (window.__cap179 = Array.from(this), window.__cap179Stack = new Error().stack) : (this[0] === 113 ? (window.__cap113 = Array.from(this), window.__cap113Stack = new Error().stack) : 0), true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  try {
    const r179 = await cdp.send('Runtime.evaluate', { expression: 'window.__cap179 ? JSON.stringify({len:window.__cap179.length, head:window.__cap179.slice(0,32), stack:window.__cap179Stack}) : "null"', returnByValue: true });
    const r113 = await cdp.send('Runtime.evaluate', { expression: 'window.__cap113 ? JSON.stringify({len:window.__cap113.length, head:window.__cap113.slice(0,32), stack:window.__cap113Stack}) : "null"', returnByValue: true });
    console.log('\n=== 179 base ===');
    if (r179.result?.value && r179.result.value !== 'null') {
      const d = JSON.parse(r179.result.value);
      console.log('len:', d.len, 'head:', d.head.join(','));
      console.log('stack:\n' + (d.stack || '').split('\n').slice(0, 15).join('\n'));
      fs.writeFileSync('/tmp/nx_browser_cap179.json', JSON.stringify(d, null, 1));
    } else console.log('未捕获 179');
    console.log('\n=== 113 明文 ===');
    if (r113.result?.value && r113.result.value !== 'null') {
      const d = JSON.parse(r113.result.value);
      console.log('len:', d.len, 'head:', d.head.join(','));
      console.log('stack:\n' + (d.stack || '').split('\n').slice(0, 15).join('\n'));
    } else console.log('未捕获 113');
  } catch (e) { console.log('读失败:', e.message.substring(0, 80)); }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
