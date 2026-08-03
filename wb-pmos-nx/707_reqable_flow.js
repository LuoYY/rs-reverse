/**
 * 707_reqable_flow.js
 * 排查 P cookie 不生成：监听 Network 请求序列 + 等待更久 + 捕获 basearr 条件断点
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

  // Network 请求序列
  page.on('request', req => {
    const rt = req.resourceType();
    if (['document', 'script'].includes(rt)) {
      console.log(`[NET] ${rt} ${req.url().replace(TARGET, '/')}`);
    }
  });
  page.on('response', res => {
    const rt = res.request().resourceType();
    if (['document', 'script'].includes(rt)) {
      console.log(`[NET] ${rt} → ${res.status()} ${res.request().url().replace(TARGET, '/')}`);
    }
  });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().substring(0, 100)); });

  // basearr 条件断点（固定 nsd=67402，环境稳定 → 可精确条件）
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length === 24 || this.length === 25 || this.length === 26 || this.length === 28) && this.every(function(x){return typeof x === "number";}) ? (window.__cap = this, true) : false',
  });
  let pauseCount = 0;
  const basearrs = [];
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    try {
      const arrR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap)', returnByValue: true });
      const arr = JSON.parse(arrR.result?.value || '[]');
      if (arr.length && !basearrs.some(b => b.length === arr.length && JSON.stringify(b) === JSON.stringify(arr))) {
        basearrs.push(arr);
        console.log(`[BA] len=${arr.length} 值=${arr.join(',')}`);
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] 加载页面...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const cookies = await context.cookies();
    const p = cookies.find(c => /P$/.test(c.name));
    console.log(`[T+${(i + 1) * 10}s] P cookie: ${p ? '★ len=' + p.value.length : '无'} | pause=${pauseCount} basearrs=${basearrs.length}`);
    if (p) break;
  }

  console.log('\n=== 汇总 ===');
  console.log('basearr 捕获数:', basearrs.length, basearrs.slice(0, 5).map(a => 'len' + a.length).join(','));
  if (errs.length) console.log('console 错误:', errs.slice(0, 5).join(' || '));
  else console.log('console 无错误');
  const cookies = await context.cookies();
  console.log('cookies:', cookies.map(c => c.name + '=' + (c.value || '').substring(0, 20) + '...').join(' '));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
