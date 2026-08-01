/**
 * 165_det_thorough.js
 *
 * 彻底 hook 随机源（含 Function 构造器、eval 绕过的 Math.random）
 * 使 cookie 完全确定性 → 连续采集验证 → 反推 basestr
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
  var FIXED_R = 0.5;
  var fixedRandom = function(){ return FIXED_R; };
  Math.random = fixedRandom;
  // Function 构造器返回的 Math.random 也是 fixed
  var origFunction = Function;
  window.Function = function(a, b) {
    try {
      var src = b !== undefined ? b : a;
      if (typeof src === 'string' && (src.indexOf('Math.random') >= 0 || src.indexOf('random()') >= 0)) {
        return function(){ return FIXED_R; };
      }
    } catch(e) {}
    return origFunction.apply(this, arguments);
  };
  window.Function.prototype = origFunction.prototype;
  var t0 = ${FIXED_TIME};
  Date.now = function(){ return t0; };
  Date.prototype.getTime = function(){ return t0; };
  var origGetTime = Date.prototype.getTime;
  Date.prototype.getTime = function(){ return t0; };
  if (window.performance && performance.now) performance.now = function(){ return t0; };
  if (window.crypto && crypto.getRandomValues) {
    crypto.getRandomValues = function(arr) { for (var i = 0; i < arr.length; i++) arr[i] = 0; return arr; };
  }
  // hook crypto.randomUUID
  if (window.crypto && crypto.randomUUID) crypto.randomUUID = function(){ return '00000000-0000-4000-8000-000000000000'; };
  window.__detThorough = true;
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
  const det = await cdp.send('Runtime.evaluate', { expression: 'window.__detThorough', returnByValue: true });
  const rand = await cdp.send('Runtime.evaluate', { expression: 'Math.random()', returnByValue: true });
  const cks = await context.cookies();
  const pc = cks.find(c => c.name.endsWith('P'));
  await context.close();
  return { det: det.result.value, rand: rand.result.value, pCookie: pc ? pc.value : '', challenge };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const r1 = await collectOnce(browser);
    console.log('第 1 次: nsd=' + (r1.challenge ? r1.challenge.nsd : '无'), 'hook=' + r1.det, 'Math.random=' + r1.rand, 'cookie=' + r1.pCookie.substring(0, 30));
    const r2 = await collectOnce(browser);
    console.log('第 2 次: nsd=' + (r2.challenge ? r2.challenge.nsd : '无'), 'hook=' + r2.det, 'Math.random=' + r2.rand, 'cookie=' + r2.pCookie.substring(0, 30));
    const same = r1.pCookie.substring(0, 30) === r2.pCookie.substring(0, 30);
    console.log('cookie 前 30 相同:', same ? '★★★' : '不同');
    console.log('cookie1 全:', r1.pCookie.substring(0, 60));
    console.log('cookie2 全:', r2.pCookie.substring(0, 60));
    if (r1.challenge && r1.pCookie) {
      fs.writeFileSync(path.join(OUT, 'det_cookie_' + r1.challenge.nsd + '.json'), JSON.stringify({ capturedAt: Date.now(), nsd: r1.challenge.nsd, cd: r1.challenge.cd, pCookie: r1.pCookie, fixedTime: FIXED_TIME, det: r1.det }));
      console.log('已保存');
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
