/**
 * 728_A85_browser_dyncode.js
 * 浏览器权威：抓应用 js 的 dynCode 源码（eval 的动态代码），对比沙箱 /tmp/nx_appjs_vm_dyn.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').substring(0, 16); }

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

  const scripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    scripts.push({ scriptId: p.scriptId, length: p.length, url: (p.url || '').substring(0, 100), hash: p.hash });
  });

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 138 && this.length <= 152 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
  });
  const handler = async (params) => { await cdp.send('Debugger.resume').catch(() => {}); };
  cdp.on('Debugger.paused', handler);

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));

  const saved = [];
  for (const s of scripts) {
    if (s.length > 100000) {
      try {
        const r = await cdp.send('Debugger.getScriptSource', { scriptId: s.scriptId });
        const src = r.scriptSource || '';
        saved.push({ url: s.url, len: src.length, sha: sha(src), source: src });
        console.log('脚本 len=' + src.length, 'url=' + s.url, 'sha=' + sha(src).substring(0, 8));
      } catch (e) {}
    }
  }
  fs.writeFileSync('/tmp/nx_browser_scripts.json', JSON.stringify(saved, null, 1));
  // 对比沙箱 dynCode
  const sandboxDyn = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('\n沙箱 dynCode len:', sandboxDyn.length, 'sha:', sha(sandboxDyn));
  for (const s of saved) {
    if (Math.abs(s.len - sandboxDyn.length) < 50) {
      console.log('匹配候选: url=' + s.url, 'len=' + s.len, 'sha=' + s.sha);
      // 前 100 对比
      console.log('浏览器 head:', s.source.substring(0, 120));
      console.log('沙箱   head:', sandboxDyn.substring(0, 120));
      const d1 = s.source.substring(0, 1000);
      const d2 = sandboxDyn.substring(0, 1000);
      console.log('前 1000 相同:', d1 === d2);
    }
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
