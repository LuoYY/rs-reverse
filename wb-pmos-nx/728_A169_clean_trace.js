/**
 * 728_A169_clean_trace.js
 * 干净追踪：明文 basearr push 后，记录所有后续 push（含 base 179）+ VM 程序
 * 用单 handler + done 标志
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

  // 捕获明文（113）断点
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let state = 'waiting_plain';
  let count = 0;
  const handler = async (params) => {
    count++;
    if (count > 20000) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      if (state === 'waiting_plain') {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          state = 'trace';
          console.log('★ 明文捕获 len:', JSON.parse((await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__plain.length)', returnByValue: true })).result?.value));
          // 移除 push 断点，换宽松断点（捕获所有 130-260 数组）
          await cdp.send('Debugger.setBreakpointOnFunctionCall', {
            objectId: pushR.result.objectId,
            condition: '(this.length >= 130 && this.length <= 260 && typeof this[0] === "number") ? (window.__all2=window.__all2||{}, window.__all2[this.length+"_"+this[0]]={arr:Array.from(this),stack:new Error().stack}, true) : false',
          });
          await cdp.send('Debugger.resume').catch(() => {});
          return;
        }
      }
      // trace 状态：断点条件已在浏览器侧收集数组，这里只需 resume
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 捕获状态:', state, 'pauses:', count);
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__all2 ? JSON.stringify(Object.keys(window.__all2)) : "null"', returnByValue: true });
    console.log('[3] 数组 keys:', r.result?.value);
    const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__all2 ? JSON.stringify(window.__all2) : "null"', returnByValue: true });
    fs.writeFileSync('/tmp/nx_browser_all2.json', JSON.stringify(JSON.parse(r2.result?.value || 'null'), null, 1));
    console.log('已保存 /tmp/nx_browser_all2.json');
  } catch (e) { console.log('读失败:', e.message.substring(0, 80)); }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
