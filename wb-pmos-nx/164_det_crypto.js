/**
 * 164_det_crypto.js
 *
 * hook 所有随机源（Math.random/crypto.getRandomValues/Date.now/performance.now）
 * 使浏览器 cookie 确定性 → reload 两次对比 → 反推 basestr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const FIXED_TIME = 1785580000000;

const EARLY_HOOK = `(function(){
  Math.random = function(){ return 0.5; };
  var t0 = ${FIXED_TIME};
  Date.now = function(){ return t0; };
  Date.prototype.getTime = function(){ return t0; };
  if (window.performance && performance.now) {
    performance.now = function(){ return t0; };
  }
  if (window.crypto && crypto.getRandomValues) {
    var fill = new Uint8Array(32); // 固定 0
    crypto.getRandomValues = function(arr) {
      for (var i = 0; i < arr.length; i++) arr[i] = 0;
      return arr;
    };
  }
  window.__detApplied = true;
  return 'ok';
})()`;

async function collectOnce(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY_HOOK });
  let challenge = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
      } catch (e) {}
    }
  });
  try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
  await page.waitForTimeout(7000);
  try { await page.reload({ timeout: 90000 }); } catch (e) {}
  await page.waitForTimeout(15000);
  await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`, returnByValue: true });
  await page.waitForTimeout(4000);
  const det = await cdp.send('Runtime.evaluate', { expression: 'window.__detApplied', returnByValue: true });
  const cks = await context.cookies();
  const pc = cks.find(c => c.name.endsWith('P'));
  await context.close();
  return { det: det.result.value, pCookie: pc ? pc.value : '', challenge };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    // 连续采集 2 次（同一页面上下文不共享——但检测确定性：如果随机源 hook 生效，同一 nsd 下 cookie 应该相同）
    const r1 = await collectOnce(browser);
    console.log('第 1 次: nsd=' + (r1.challenge ? r1.challenge.nsd : '无'), 'hook=' + r1.det, 'cookie=' + r1.pCookie.length);
    const r2 = await collectOnce(browser);
    console.log('第 2 次: nsd=' + (r2.challenge ? r2.challenge.nsd : '无'), 'hook=' + r2.det, 'cookie=' + r2.pCookie.length);
    if (r1.challenge && r2.challenge && r1.challenge.nsd === r2.challenge.nsd) {
      console.log('同 nsd cookie 相同:', r1.pCookie === r2.pCookie ? '★★★ 确定性!' : '不同（随机源未完全 hook）');
      if (r1.pCookie === r2.pCookie) {
        const result = { capturedAt: Date.now(), nsd: r1.challenge.nsd, cd: r1.challenge.cd, pCookie: r1.pCookie, fixedTime: FIXED_TIME };
        fs.writeFileSync(path.join(OUT, 'det_cookie_' + r1.challenge.nsd + '.json'), JSON.stringify(result));
        console.log('已保存');
      }
    } else {
      console.log('nsd 不同（无法对比）——cookie1:', r1.pCookie.substring(0, 20), 'cookie2:', r2.pCookie.substring(0, 20));
      // 保存第一次的（仍有价值）
      if (r1.challenge && r1.pCookie) {
        const result = { capturedAt: Date.now(), nsd: r1.challenge.nsd, cd: r1.challenge.cd, pCookie: r1.pCookie, fixedTime: FIXED_TIME };
        fs.writeFileSync(path.join(OUT, 'det_cookie_' + r1.challenge.nsd + '.json'), JSON.stringify(result));
        console.log('已保存第 1 次');
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
