/**
 * 728_A132_sanity.js
 * 验证固定环境页面加载 + P cookie 生成 + 捕获 basearr（复现 708 方法）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';

(async () => {
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

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), true) : ((this.length >= 160 && this.length <= 190 && this.every(function(x){return typeof x === "number";}) && !window.__capFull) ? (window.__capFull = Array.from(this), true) : false)',
  });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  try {
    const r28 = await cdp.send('Runtime.evaluate', { expression: 'window.__cap28 ? JSON.stringify(window.__cap28) : "null"', returnByValue: true });
    const rF = await cdp.send('Runtime.evaluate', { expression: 'window.__capFull ? JSON.stringify(window.__capFull.slice(0,30)) : "null"', returnByValue: true });
    const rFLen = await cdp.send('Runtime.evaluate', { expression: 'window.__capFull ? window.__capFull.length : 0', returnByValue: true });
    console.log('[2] cap28:', r28.result?.value);
    console.log('[2] capFull head:', rF.result?.value, 'len:', rFLen.result?.value);
  } catch (e) { console.log('读失败:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 20000));
  const ck = await context.cookies();
  console.log('[3] cookies:', ck.filter(c => /[OP]$/.test(c.name)).map(c => `${c.name}=len${c.value.length}`).join(' '));
  try {
    const rFLen2 = await cdp.send('Runtime.evaluate', { expression: 'window.__capFull ? window.__capFull.length : 0', returnByValue: true });
    console.log('[4] capFull len (后):', rFLen2.result?.value);
  } catch (e) {}
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
