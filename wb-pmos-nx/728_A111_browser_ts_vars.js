/**
 * 728_A111_browser_ts_vars.js
 * 浏览器权威：采集 $_ts 上的 10 个 _\$xx 环境变量的值
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
        const out = { basearr: arr, tsVars: {} };
        try {
          const ts = await cdp.send('Runtime.evaluate', {
            expression: `JSON.stringify((()=>{const t=$_ts||{};const out={};for(const k of Object.keys(t)){const v=t[k];if(typeof v==='function'){out[k]='fn:'+String(v).substring(0,80);}else if(Array.isArray(v)){out[k]='arr/'+v.length+':'+JSON.stringify(v).substring(0,100);}else if(typeof v==='object'&&v!==null){out[k]='obj:'+Object.keys(v).join(',').substring(0,100);}else{out[k]=typeof v+':'+String(v).substring(0,80);}}return out;})())`,
            returnByValue: true,
          });
          out.tsVars = JSON.parse(ts.result?.value || '{}');
        } catch (e) {}
        fs.writeFileSync('/tmp/nx_browser_ts_vars.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_ts_vars.json');
        for (const [k, v] of Object.entries(out.tsVars)) console.log(`${k}: ${v}`);
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
