/**
 * 161_browser_early_hook.js
 *
 * CDP addScriptToEvaluateOnNewDocument：页面加载前注入 hook
 * 抓 basestr（split hook）+ 编码字符集（join hook）+ cookie
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
  window.__basestrs = [];
  window.__charAtLog = [];
  var origSplit = String.prototype.split;
  String.prototype.split = function(sep) {
    try {
      var s = String(this);
      if (s.length >= 60 && s.length <= 90 && s.indexOf('-') >= 0 && s.indexOf('_') >= 0 && s.indexOf('.') < 0) {
        window.__basestrs.push({ s: s, len: s.length });
      }
    } catch(e) {}
    return origSplit.call(this, sep);
  };
  var origJoin = Array.prototype.join;
  Array.prototype.join = function(sep) {
    try {
      var len = this.length;
      if (len > 200 && typeof this[0] === 'string') {
        var chars = new Set();
        for (var i = 0; i < len; i++) if (typeof this[i] === 'string') chars.add(this[i]);
        if (chars.size >= 50) window.__joins = window.__joins || []; window.__joins.push({ len: len, chars: Array.from(chars).sort().join('') });
      }
    } catch(e) {}
    return origJoin.call(this, sep);
  };
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
    // 页面加载前注入
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
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) { console.log('goto:', e.message.substring(0, 40)); }
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) { console.log('reload:', e.message.substring(0, 40)); }
    await page.waitForTimeout(15000);
    // 触发
    await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`, returnByValue: true });
    await page.waitForTimeout(5000);
    const rr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({bs:window.__basestrs||[], j:window.__joins||[]})', returnByValue: true });
    let data = { bs: [], j: [] };
    try { data = JSON.parse(rr.result.value); } catch (e) {}
    const cks = await context.cookies();
    console.log('challenge:', challenge ? 'nsd=' + challenge.nsd : '无');
    console.log('basestr 候选:');
    const dedup = [...new Map((data.bs || []).map(b => [b.s, b])).values()];
    dedup.slice(0, 10).forEach(b => console.log('  len=' + b.len, JSON.stringify(b.s)));
    console.log('join 候选:');
    (data.j || []).slice(0, 5).forEach(j => console.log('  len=' + j.len, 'chars=' + j.chars));
    console.log('cookies:', cks.map(c => c.name + '(' + c.value.length + ')').join(', '));
    if (challenge && (data.bs.length || data.j.length)) {
      const result = { capturedAt: Date.now(), nsd: challenge.nsd, cd: challenge.cd, basestrs: data.bs, joins: data.j, cookies: cks.map(c => ({ name: c.name, value: c.value })) };
      fs.writeFileSync(path.join(OUT, 'browser_basestr_' + Date.now() + '.json'), JSON.stringify(result));
      console.log('已保存');
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
