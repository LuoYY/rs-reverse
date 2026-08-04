/**
 * 728_A136_capture_with_stack.js
 * route 拦截（固定 nsd=67402）+ 捕获 130-200 数组 + 调用栈 + P cookie
 * 目标：明文 basearr(113) 与 base(179) 是否都出现 + 各自构造位置
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

  // 捕获 130-200 纯数字数组（首次出现的长度去重）+ 调用栈
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 130 && this.length <= 200 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;})) ? (window.__captures = window.__captures || {}, (function(){var a=Array.from(this); var key=a.length+"_"+a[0]; if(!window.__captures[key]){window.__captures[key]={arr:a, stack:new Error().stack};}})() , false) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'window.__captures ? JSON.stringify(Object.keys(window.__captures).map(function(k){var c=window.__captures[k];return {key:k, head:c.arr.slice(0,10), tail:c.arr.slice(-6)};})) : "null"', returnByValue: true });
  console.log('捕获摘要:', r.result?.value);
  const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__captures ? JSON.stringify(window.__captures) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_captures_v2.json', JSON.stringify(JSON.parse(r2.result?.value || 'null'), null, 1));
  console.log('已保存 /tmp/nx_browser_captures_v2.json');
  // P cookie
  const ck = await context.cookies();
  const p = ck.find(c => /P$/.test(c.name));
  if (p) fs.writeFileSync('/tmp/nx_browser_P_v2.txt', p.value);
  console.log('P cookie len:', p ? p.value.length : 0);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
