/**
 * 728_A110_browser_ts_at_eval.js
 * 浏览器权威：在应用 js eval dynCode 的瞬间（scriptParsed 或断点），检查 $_ts 是否有数字键 0-7
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

  // 在 push basearr 断点前，通过 hook 读取 $_ts 完整状态
  // 方法：hook eval —— 在 eval 前用 Runtime.evaluate 注入 window.__tsSnapshots 收集 $_ts
  await cdp.send('Runtime.evaluate', {
    expression: `(()=>{window.__tsSnap=[];const _origEval=eval;window.__origEval=_origEval;})()`,
  });

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
        // 读 $_ts 完整 keys
        try {
          const ts = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify((()=>{const t=$_ts||{};const ks=Object.keys(t);return {keys:ks, has0:'0'in t, has1:'1'in t, has7:'7'in t, cpLen:Array.isArray(t.cp)?t.cp.length:typeof t.cp, t0:('0'in t)?(typeof t[0]==='string'?t[0].substring(0,50):(Array.isArray(t[0])?'arr/'+t[0].length:'type:'+typeof t[0])):null};})())`, returnByValue: true });
          out.tsInfo = ts.result?.value;
        } catch (e) {}
        fs.writeFileSync('/tmp/nx_browser_ts_at_eval.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_ts_at_eval.json');
        console.log('tsInfo:', out.tsInfo);
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
