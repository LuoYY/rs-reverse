/**
 * 728_A133_route_capture.js
 * 用 route fulfill（412.raw 挑战页）替代 reqable：浏览器加载固定 nsd/cd 挑战页 → 捕获 basearr 构造
 * 捕获所有 130-200 纯数字数组（含 113 明文 + 179 base）+ P cookie
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
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  console.log('挑战页 nsd:', (rawBody.match(/nsd=(\d+)/) || [])[1], 'cd len:', (rawBody.match(/cd="([^"]+)"/) || [])[1]?.length);

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

  // route 拦截：挑战页 fulfill + 静态 js 放行（nx-mock 提供）
  await page.route('**', async (route) => {
    const url = route.request().url();
    if (url === TARGET || url.startsWith(TARGET)) {
      if (route.request().resourceType() === 'document') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
    }
    // 其他请求继续（nx-mock 通过代理提供 js）
    await route.continue().catch(() => {});
  });

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 130 && this.length <= 200 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;})) ? (function(){var a=Array.from(this);window.__arrs=window.__arrs||[];if(!window.__arrs.some(function(b){return b.length===a.length&&b[0]===a[0];})){window.__arrs.push(a);}return false;})() : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs.map(function(a){return {len:a.length, head:a.slice(0,8), tail:a.slice(-6)};})) : "null"', returnByValue: true });
  console.log('捕获数组摘要:', r.result?.value);
  const ck = await context.cookies();
  console.log('cookies:', ck.filter(c => /[OP]$/.test(c.name)).map(c => `${c.name}=len${c.value.length}`).join(' '));
  const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_all_arrays4.json', JSON.stringify({ arrs: JSON.parse(r2.result?.value || 'null') }, null, 1));
  console.log('已保存 /tmp/nx_browser_all_arrays4.json');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
