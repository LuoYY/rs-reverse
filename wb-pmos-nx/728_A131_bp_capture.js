/**
 * 728_A131_bp_capture.js
 * setBreakpointOnFunctionCall 捕获所有 130-200 纯数字数组（存 window）
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
  const cond = '(this.length >= 130 && this.length <= 200 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;})) ? (function(){var a=Array.from(this);window.__arrs=window.__arrs||[];if(!window.__arrs.some(function(b){return b.length===a.length&&b[0]===a[0];})){window.__arrs.push(a);}return false;})() : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs.map(function(a){return {len:a.length, head:a.slice(0,8), tail:a.slice(-6)};})) : "null"', returnByValue: true });
  console.log('捕获数组摘要:', r.result?.value);
  const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_all_arrays3.json', JSON.stringify({ arrs: JSON.parse(r2.result?.value || 'null') }, null, 1));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
