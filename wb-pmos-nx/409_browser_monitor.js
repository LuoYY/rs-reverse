/**
 * 409_browser_monitor.js
 * 浏览器对照（分析用）：addInitScript 监控 documentMode/documentElement/all/body 读取 → 触发挑战 → 输出读取源
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' };

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    // 页面加载前注入 getter 监控
    await context.addInitScript(`
      (function(){
        var __log = window.__accessLog = [];
        function watch(obj, name, props) {
          if (!obj || typeof obj !== 'object') return;
          for (var i = 0; i < props.length; i++) {
            (function(prop){
              var desc = Object.getOwnPropertyDescriptor(obj, prop);
              if (desc && !desc.configurable) return;
              try {
                Object.defineProperty(obj, prop, {
                  get: function() { __log.push(name + '.' + prop); if (__log.length > 200) __log.shift(); return desc ? desc.get ? desc.get() : desc.value : undefined; },
                  set: function(v) { if (desc && desc.set) desc.set(v); },
                  configurable: true
                });
              } catch(e) {}
            })(props[i]);
          }
        }
        window.addEventListener('DOMContentLoaded', function(){
          watch(document, 'document', ['documentMode', 'compatMode', 'documentElement', 'all', 'body', 'head', 'readyState', 'characterSet']);
        });
      })();
    `);
    const page = await context.newPage();
    // 触发挑战 + 等 P cookie
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(15000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(15000);
    console.log('标题:', await page.evaluate(() => document.title).catch(() => '?'));
    // 输出访问记录
    const access = await page.evaluate(() => window.__accessLog || []).catch(() => []);
    console.log('=== document 属性访问记录 ===');
    console.log(JSON.stringify(access.slice(-50)));
    console.log('总数:', access.length);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    console.log('P cookie:', pc ? '有(' + pc.value.length + ')' : '无');
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
