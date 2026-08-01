/**
 * 162_deterministic_cookie.js
 *
 * 终极反推 basestr：
 * 1. 浏览器固定 Math.random/Date.now/performance.now → 采集确定性 cookie + 固定值
 * 2. 管线推导 keys（同 cd）→ 用固定 random/time 重现 cookie（86 basestr）→ 得到密文 enc
 * 3. 反推 nx basestr：enc 分组 → 浏览器 cookie 字符（同一 enc，不同 basestr 编码）
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
const FIXED_RANDOM = 0.5;
const FIXED_TIME = 1785580000000; // 固定时间戳

const EARLY_HOOK = `(function(){
  Math.random = function(){ return ${FIXED_RANDOM}; };
  var t0 = ${FIXED_TIME};
  Date.now = function(){ return t0; };
  Date.prototype.getTime = function(){ return t0; };
  window.__hookApplied = true;
  return 'ok';
})()`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let challenge = null, pCookie = '', oCookie = '';
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY_HOOK });
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
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) { console.log('goto:', e.message.substring(0, 40)); }
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) { console.log('reload:', e.message.substring(0, 40)); }
    await page.waitForTimeout(15000);
    await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`, returnByValue: true });
    await page.waitForTimeout(5000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    const oc = cks.find(c => c.name.endsWith('O'));
    if (pc) pCookie = pc.value;
    if (oc) oCookie = oc.name + '=' + oc.value;
    const hook = await cdp.send('Runtime.evaluate', { expression: 'window.__hookApplied', returnByValue: true });
    console.log('hook 生效:', hook.result.value);
    console.log('nsd:', challenge ? challenge.nsd : '无', 'P cookie:', pCookie.length);
    await context.close();
  } finally { await browser.close(); }
  if (!challenge || !pCookie) { console.log('采集失败'); process.exit(1); }
  const result = { capturedAt: Date.now(), nsd: challenge.nsd, cd: challenge.cd, pCookie, oCookie, fixedRandom: FIXED_RANDOM, fixedTime: FIXED_TIME };
  fs.writeFileSync(path.join(OUT, 'det_cookie_' + challenge.nsd + '.json'), JSON.stringify(result));
  console.log('已保存 det_cookie_' + challenge.nsd + '.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
