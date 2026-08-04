/**
 * 728_A139_capture_base_fixed.js
 * route 拦截环境 + 正确捕获 160-180 纯数字数组（base 179 开头 / 明文 113 开头）
 * 简化条件：不用 every（性能），用 this[0] 判断
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

  // 捕获：this.length 在 150-190 且 this[0] 是数字（避免空数组）
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 150 && this.length <= 190 && typeof this[0] === "number") ? (window.__cap = Array.from(this), window.__capStack = new Error().stack, true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__cap ? JSON.stringify({len:window.__cap.length, head:window.__cap.slice(0,32), tail:window.__cap.slice(-8), stack:window.__capStack}) : "null"', returnByValue: true });
    const val = r.result?.value;
    if (val && val !== 'null') {
      const d = JSON.parse(val);
      console.log('捕获 len:', d.len);
      console.log('head[0-31]:', d.head.join(','));
      console.log('tail:', d.tail.join(','));
      console.log('stack:\n' + (d.stack || '').split('\n').slice(0, 12).join('\n'));
      fs.writeFileSync('/tmp/nx_browser_cap_full.json', JSON.stringify(d, null, 1));
    } else console.log('未捕获 150-190 数组');
  } catch (e) { console.log('读失败:', e.message.substring(0, 80)); }
  const ck = await context.cookies();
  console.log('P cookie len:', (ck.find(c => /P$/.test(c.name)) || {}).value?.length || 0);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
