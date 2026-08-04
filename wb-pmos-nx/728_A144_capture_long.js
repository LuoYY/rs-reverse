/**
 * 728_A144_capture_long.js
 * 长时间 + 宽松捕获：140-260 所有数字数组（记录 first 元素 + len + stack）
 * 确认 base（179）是否在浏览器 VM 中以数组存在
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

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 140 && this.length <= 260 && typeof this[0] === "number") ? (window.__caps=window.__caps||{}, window.__caps[this.length+"_"+this[0]]={arr:Array.from(this),stack:new Error().stack}, true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  let pauses = 0;
  cdp.on('Debugger.paused', async () => { pauses++; await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 55000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'window.__caps ? JSON.stringify(Object.keys(window.__caps)) : "null"', returnByValue: true });
  console.log('[2] 捕获 keys:', r.result?.value, 'pauses:', pauses);
  const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__caps ? JSON.stringify(window.__caps) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_caps_long.json', JSON.stringify(JSON.parse(r2.result?.value || 'null'), null, 1));
  console.log('已保存 /tmp/nx_browser_caps_long.json');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
