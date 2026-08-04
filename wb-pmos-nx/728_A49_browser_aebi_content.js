/**
 * 728_A49_browser_aebi_content.js
 * 抓浏览器 $_ts.aebi 完整内容 + scj 完整内容，与沙箱对比
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
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 138 && this.length <= 152 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
  });

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__basearr)', returnByValue: true });
      const arr = JSON.parse(r.result?.value || '[]');
      if (arr.length >= 138) {
        done = true;
        cdp.off('Debugger.paused', handler);
        const out = { basearr: arr };
        // 抓 $_ts 完整
        try {
          const ts = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify((()=>{const t=$_ts||{};const a=(t.aebi||[]).map(x=>Array.isArray(x)?x:x);return {nsd:t.nsd,cdLen:(t.cd||'').length,aebi: a, scj: t.scj};})())`, returnByValue: true });
          const parsed = JSON.parse(ts.result?.value || '{}');
          out.nsd = parsed.nsd;
          out.cdLen = parsed.cdLen;
          out.aebi = parsed.aebi;
          out.scj = parsed.scj;
          console.log('nsd:', parsed.nsd, 'cdLen:', parsed.cdLen);
          console.log('aebi lens:', (parsed.aebi || []).map(a => Array.isArray(a) ? a.length : 'n/a').join(','));
          if (Array.isArray(parsed.aebi)) {
            for (let i = 0; i < parsed.aebi.length; i++) {
              const a = parsed.aebi[i];
              if (Array.isArray(a)) {
                console.log(`aebi[${i}] 前 30:`, a.slice(0, 30).join(','));
              } else {
                console.log(`aebi[${i}]:`, typeof a, String(a).substring(0, 100));
              }
            }
          }
          console.log('scj:', JSON.stringify(parsed.scj).substring(0, 500));
        } catch (e) { console.log('ts 抓取失败:', e.message.substring(0, 80)); }
        fs.writeFileSync('/tmp/nx_browser_aebi_full.json', JSON.stringify(out));
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
