/**
 * 166_capture_iv.js
 *
 * hook crypto.getRandomValues + Math.random 记录随机源调用
 * 抓 cookie 的 IV（16 字节）→ 反推 basestr 前 22 字符映射
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
  var t0 = ${FIXED_TIME};
  Date.now = function(){ return t0; };
  Date.prototype.getTime = function(){ return t0; };
  if (window.performance && performance.now) performance.now = function(){ return t0; };
  window.__cryptoLog = [];
  if (window.crypto && crypto.getRandomValues) {
    var origGRV = crypto.getRandomValues;
    crypto.getRandomValues = function(arr) {
      var ret = origGRV.call(this, arr);
      try {
        window.__cryptoLog.push({ len: arr.length, arr: Array.prototype.slice.call(arr) });
      } catch(e) {}
      return ret;
    };
  }
  window.__randLog = [];
  var origRand = Math.random;
  Math.random = function() {
    var r = origRand();
    try { window.__randLog.push(r); } catch(e) {}
    return r;
  };
  window.__detApplied = true;
  return 'ok';
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
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
    const rr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({crypto:window.__cryptoLog||[], rand:window.__randLog||[]})', returnByValue: true });
    let data = { crypto: [], rand: [] };
    try { data = JSON.parse(rr.result.value); } catch (e) {}
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    console.log('nsd:', challenge ? challenge.nsd : '无');
    console.log('crypto.getRandomValues 调用:');
    data.crypto.slice(0, 20).forEach((c, i) => console.log('  [' + i + '] len=' + c.len, c.len <= 32 ? c.arr.map(b => b.toString(16).padStart(2, '0')).join(' ') : '(大数组)'));
    console.log('Math.random 调用次数:', data.rand.length, '前 10:', data.rand.slice(0, 10).map(r => r.toFixed(4)).join(', '));
    console.log('P cookie:', pc ? pc.value.substring(0, 40) + '...(' + pc.value.length + ')' : '无');
    if (challenge && pc) {
      fs.writeFileSync(path.join(OUT, 'iv_capture_' + challenge.nsd + '.json'), JSON.stringify({ nsd: challenge.nsd, cd: challenge.cd, cryptoLog: data.crypto, randLog: data.rand, pCookie: pc.value, capturedAt: Date.now() }));
      console.log('已保存');
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
