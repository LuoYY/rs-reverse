/**
 * 728_A130_capture_simple.js
 * 简化捕获：任何 140-180 纯数字数组，记录 len+head，配合 P cookie 对照
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

  // 用 push hook 记录所有 130-200 纯数字数组（不 break，直接存）
  await cdp.send('Runtime.evaluate', {
    expression: `(()=>{
      window.__arrs=window.__arrs||[];
      var op=Array.prototype.push;
      Array.prototype.push=function(){
        var r=op.apply(this,arguments);
        try{
          if(Array.isArray(this)&&this.length>=130&&this.length<=200&&this.every(function(x){return typeof x==='number'&&x>=0&&x<256;})){
            var a=Array.from(this);
            if(!window.__arrs.some(function(b){return b.length===a.length&&b[0]===a[0];})){
              window.__arrs.push(a);
            }
          }
        }catch(e){}
        return r;
      };
    })()`,
  });

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__arrs ? window.__arrs.map(function(a){return {len:a.length, head:a.slice(0,8), tail:a.slice(-6)};}) : "null")', returnByValue: true });
  console.log('捕获数组摘要:', r.result?.value);
  const r2 = await cdp.send('Runtime.evaluate', { expression: 'window.__arrs ? JSON.stringify(window.__arrs) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_all_arrays2.json', JSON.stringify({ arrs: JSON.parse(r2.result?.value || 'null') }, null, 1));
  console.log('已保存');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
