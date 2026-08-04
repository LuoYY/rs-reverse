/**
 * 728_A163_capture_after_plain.js
 * 明文 basearr 构造后，捕获后续 VM 程序执行（base 生成）
 * 监听 _\$\$1 调用（basearr 相关）的所有 _\$hr 程序
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

  // 捕获明文 basearr（113）后，再捕获 179 数组（base）
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : ((this.length >= 140 && this.length <= 250 && typeof this[0] === "number" && this[0] === 179 && !window.__base) ? (window.__base = Array.from(this), true) : false)';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });

  let pauses = 0;
  cdp.on('Debugger.paused', async () => {
    pauses++;
    if (pauses > 30000) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    // 每次暂停检查是否捕获 base，若是则记录 VM 状态
    try {
      const rBase = await cdp.send('Runtime.evaluate', { expression: 'window.__base ? JSON.stringify({len:window.__base.length, head:window.__base.slice(0,16)}) : "null"', returnByValue: true });
      if (rBase.result?.value && rBase.result.value !== 'null') {
        const b = JSON.parse(rBase.result.value);
        if (b.len >= 140 && b.head[0] === 179 && !global.__baseSaved) {
          global.__baseSaved = true;
          console.log('★ 捕获 base:', b.len, b.head.join(','));
          // 保存 VM 状态
          const r2 = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__base)', returnByValue: true });
          fs.writeFileSync('/tmp/nx_browser_base_arr.json', r2.result?.value || 'null');
          await cdp.send('Debugger.resume').catch(() => {});
          return;
        }
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  try {
    const rP = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? JSON.stringify({len:window.__plain.length, head:window.__plain.slice(0,16)}) : "null"', returnByValue: true });
    console.log('[2] 明文:', rP.result?.value);
    const rB = await cdp.send('Runtime.evaluate', { expression: 'window.__base ? JSON.stringify({len:window.__base.length, head:window.__base.slice(0,16)}) : "null"', returnByValue: true });
    console.log('[3] base:', rB.result?.value);
  } catch (e) { console.log('读失败:', e.message.substring(0, 80)); }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
