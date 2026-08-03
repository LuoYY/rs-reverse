/**
 * 461_browser_aebi.js
 * 浏览器对照（分析用）：捕获 $_ts.aebi/scj，理解环境数组是否环境相关
 * 对比沙箱 aebi → 判断纯算法可行性
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const PROXY = { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' };
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    proxy: PROXY,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // 早期注入：轮询捕获 $_ts
  await page.addInitScript(() => {
    window.__tsCapture = null;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (window.$_ts && window.$_ts.aebi) {
        window.__tsCapture = {
          nsd: window.$_ts.nsd,
          aebi: window.$_ts.aebi,
          scj: window.$_ts.scj,
          cp: window.$_ts.cp,
        };
        clearInterval(iv);
      }
      if (tries > 100) clearInterval(iv);
    }, 100);
  });

  console.log('访问目标...');
  try {
    await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' });
  } catch (e) { console.log('goto:', e.message.substring(0, 80)); }
  await page.waitForTimeout(8000);

  // 读取捕获的 $_ts
  const cap = await page.evaluate(() => window.__tsCapture);
  if (cap) {
    console.log('=== 浏览器 $_ts 捕获 ===');
    console.log('nsd:', cap.nsd);
    console.log('aebi 组数:', cap.aebi ? cap.aebi.length : 0);
    if (cap.aebi) {
      cap.aebi.forEach((g, i) => {
        if (Array.isArray(g)) console.log(`aebi[${i}]: array[${g.length}] head=${g.slice(0, 6).join(',')} tail=${g.slice(-4).join(',')}`);
        else console.log(`aebi[${i}]: ${typeof g} ${String(g).substring(0, 40)}`);
      });
    }
    console.log('scj:', JSON.stringify(cap.scj).substring(0, 120));
    fs.writeFileSync('/tmp/browser_aebi.json', JSON.stringify(cap, null, 2));
    console.log('已保存 /tmp/browser_aebi.json');
  } else {
    console.log('未捕获 $_ts（检查 window.$_ts）');
    const has = await page.evaluate(() => typeof window.$_ts !== 'undefined' ? Object.keys(window.$_ts) : 'no $_ts');
    console.log('window.$_ts:', JSON.stringify(has));
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
