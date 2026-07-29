/**
 * 诊断：用 Patchright（真实浏览器）跑内层 VM，hook 所有可能的指纹采集 API，
 * 记录瑞数动态代码实际读取了哪些环境特征（navigator/screen/canvas/window/document 属性）。
 * 这些就是需要注入 jsdom 的指纹点。
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_fingerprint_probe.js
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();

  // 在页面加载前注入指纹采集探针（记录瑞数读取的属性）
  await context.addInitScript(() => {
    window.__fpReads = [];
    const log = (obj, prop, val) => {
      try { window.__fpReads.push(`${obj}.${prop}=${JSON.stringify(val && val.toString ? val.toString().substring(0, 60) : val)}`); } catch (e) {}
    };
    // hook navigator 属性
    const navProps = ['userAgent', 'platform', 'maxTouchPoints', 'appName', 'appVersion', 'language', 'languages', 'vendor', 'vendorSub', 'productSub', 'cookieEnabled', 'onLine', 'hardwareConcurrency', 'deviceMemory', 'webdriver', 'plugins', 'mimeTypes', 'doNotTrack', 'pdfViewerEnabled'];
    for (const p of navProps) {
      try {
        const orig = Object.getOwnPropertyDescriptor(Navigator.prototype, p) || Object.getOwnPropertyDescriptor(navigator, p);
        if (orig && orig.get) {
          Object.defineProperty(Navigator.prototype, p, { get: function () { const v = orig.get.call(this); log('navigator', p, v); return v; }, configurable: true });
        }
      } catch (e) {}
    }
    // hook screen 属性
    for (const p of ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth', 'availLeft', 'availTop']) {
      try {
        const orig = Object.getOwnPropertyDescriptor(Screen.prototype, p);
        if (orig && orig.get) {
          Object.defineProperty(Screen.prototype, p, { get: function () { const v = orig.get.call(this); log('screen', p, v); return v; }, configurable: true });
        }
      } catch (e) {}
    }
    // hook window 尺寸
    for (const p of ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio']) {
      try {
        Object.defineProperty(window, p, { get: () => { const v = p === 'devicePixelRatio' ? 2 : 1680; log('window', p, v); return v; }, configurable: true });
      } catch (e) {}
    }
    // hook canvas
    try {
      const origGetCtx = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...a) { log('canvas', 'getContext', type); return origGetCtx.call(this, type, ...a); };
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...a) { const v = origToDataURL.apply(this, a); log('canvas', 'toDataURL', v.length); return v; };
    } catch (e) {}
    // hook document 特征
    for (const p of ['hidden', 'visibilityState', 'hasFocus', 'cookie', 'documentElement', 'characterSet']) {
      try {
        const orig = Object.getOwnPropertyDescriptor(Document.prototype, p);
        if (orig && orig.get) {
          Object.defineProperty(Document.prototype, p, { get: function () { const v = orig.get.call(this); log('document', p, v); return v; }, configurable: true });
        }
      } catch (e) {}
    }
    // hook Date/timezone
    try {
      const origGetTz = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = function () { const v = origGetTz.call(this); log('Date', 'getTimezoneOffset', v); return v; };
    } catch (e) {}
    // hook Intl
    try { log('Intl', 'DateTimeFormat', Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
  });

  await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const reads = await page.evaluate(() => window.__fpReads || []);
  await browser.close();

  console.log(`瑞数动态代码采集的指纹点（${reads.length} 次读取）:`);
  const uniq = [...new Set(reads)];
  // 按对象分组
  const byObj = {};
  for (const r of uniq) {
    const obj = r.split('.')[0];
    (byObj[obj] = byObj[obj] || []).push(r);
  }
  for (const [obj, items] of Object.entries(byObj)) {
    console.log(`\n[${obj}] (${items.length})`);
    items.forEach(i => console.log('  ' + i));
  }
  fs.writeFileSync('/tmp/fp_reads.json', JSON.stringify(uniq, null, 2));
  console.log('\n已存 /tmp/fp_reads.json');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
