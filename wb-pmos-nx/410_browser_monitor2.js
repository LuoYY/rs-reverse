/**
 * 410_browser_monitor2.js
 * 浏览器对照：addInitScript 早期监控 documentMode/documentElement/all/body 读取
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    await context.addInitScript(`
      (function(){
        window.__accessLog = [];
        function watch(obj, name, props) {
          if (!obj || typeof obj !== 'object') return;
          for (var i = 0; i < props.length; i++) {
            (function(prop){
              var desc;
              try { desc = Object.getOwnPropertyDescriptor(obj, prop); } catch(e) { return; }
              try {
                Object.defineProperty(obj, prop, {
                  get: function() {
                    window.__accessLog.push(name + '.' + prop);
                    if (window.__accessLog.length > 300) window.__accessLog.shift();
                    return desc ? (desc.get ? desc.get() : desc.value) : undefined;
                  },
                  configurable: true
                });
              } catch(e) {}
            })(props[i]);
          }
        }
        // 立即监控（不等 DOMContentLoaded）
        watch(document, 'document', ['documentMode', 'compatMode', 'documentElement', 'all', 'body', 'head', 'readyState', 'characterSet', 'doctype', 'cookie']);
      })();
    `);
    const page = await context.newPage();
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(15000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(15000);
    const access = await page.evaluate(() => window.__accessLog || []).catch(() => []);
    console.log('=== document 属性访问 ===');
    console.log(JSON.stringify(access.slice(-80)));
    console.log('总数:', access.length);
    // 也检查 documentMode 值
    const dm = await page.evaluate(() => {
      try { return { mode: document.documentMode, all0: document.all ? document.all[0] ? 'obj' : 'undef' : 'noall', el: document.documentElement ? 'obj' : 'undef' }; } catch (e) { return { err: e.message }; }
    }).catch(() => ({}));
    console.log('浏览器 document 状态:', JSON.stringify(dm));
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
