/**
 * 172_capture_floor.js
 *
 * hook 浏览器 Math.floor/Date.now 记录关键值 → 抓 IV 生成（floor(random*4294967295)）
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

const EARLY_HOOK = `(function(){
  window.__floors = [];
  var ofl = Math.floor;
  Math.floor = function(v) {
    try {
      if (v > 1e9 && v < 2e19) window.__floors.push({ v: v, r: Math.floor(v) });
    } catch(e) {}
    return ofl(v);
  };
  window.__dates = [];
  var od = Date.now;
  Date.now = function() { var r = od(); window.__dates.push(r); return r; };
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
    const rr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({floors:window.__floors, dates:window.__dates})', returnByValue: true });
    let data = { floors: [], dates: [] };
    try { data = JSON.parse(rr.result.value); } catch (e) {}
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    console.log('nsd:', challenge ? challenge.nsd : '无');
    console.log('Math.floor 大值调用:', data.floors.length);
    data.floors.slice(0, 10).forEach(f => console.log('  v=' + f.v.toExponential(2), '→ ' + f.r.toString(16)));
    console.log('Date.now 调用:', data.dates.length, '首:', data.dates[0], '尾:', data.dates[data.dates.length - 1]);
    console.log('P cookie 前 22:', pc ? pc.value.substring(0, 22) : '无');
    if (challenge && pc) {
      fs.writeFileSync(path.join(OUT, 'floor_capture_' + challenge.nsd + '.json'), JSON.stringify({ nsd: challenge.nsd, cd: challenge.cd, floors: data.floors, dates: data.dates, pCookie: pc.value }));
      console.log('已保存');
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
