/**
 * 72_browser_dyn.js
 *
 * 抓浏览器真实动态代码（Patchright hook eval），对比沙箱动态代码
 * 决定沙箱死循环是"生成时反检测"还是"执行时缺环境"
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

async function main() {
  // 用 sync 会话的 nsd/cd（同 cd 对比）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  console.log('浏览器 nsd:', nsd, 'cdLen:', cd.length);

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  // addInitScript：先于页面脚本注入 eval hook（hook 间接 eval）
  await context.addInitScript(() => {
    // hook Function.prototype 上的 eval 调用链
    const origEval = window.eval.bind(window);
    window.__dynCode = null;
    window.eval = function (code) {
      try {
        if (typeof code === 'string' && code.length > 100000 && !window.__dynCode) {
          window.__dynCode = code;
        }
      } catch (e) {}
      return origEval(code);
    };
    // 间接 eval（瑞数用 _$g6.call(_$at, code)）
    const origCall = Function.prototype.call;
    Function.prototype.call = function () {
      const args = arguments;
      if (typeof args[0] === 'object' && typeof args[1] === 'string' && args[1].length > 100000 && !window.__dynCode) {
        window.__dynCode = args[1];
      }
      return origCall.apply(this, args);
    };
  });
  const page = await context.newPage();
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 触发请求确保动态代码执行
  await page.evaluate(() => {
    try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.setRequestHeader('Content-Type', 'application/json'); x.send('{}'); } catch (e) {}
  }).catch(() => {});

  const dyn = await page.evaluate(() => window.__dynCode).catch(() => null);
  if (dyn && typeof dyn === 'string') {
    const fname = path.join(OUT, 'browser_dyn_' + Date.now() + '.js');
    fs.writeFileSync(fname, dyn);
    console.log('浏览器动态代码:', dyn.length, 'chars →', fname);
    // 对比沙箱
    const sandFile = fs.readdirSync(OUT).filter(f => f.startsWith('sandbox_dyn_')).sort().pop();
    if (sandFile) {
      const sand = fs.readFileSync(path.join(OUT, sandFile), 'utf8');
      console.log('沙箱动态代码:', sand.length, 'chars');
      console.log('浏览器 _\$ 数:', (dyn.match(/_\$/g) || []).length, '沙箱 _\$ 数:', (sand.match(/_\$/g) || []).length);
      // 检查浏览器是否有 ā 混淆
      console.log('浏览器 ā 数:', (dyn.match(/ā/g) || []).length, '沙箱 ā 数:', (sand.match(/ā/g) || []).length);
    }
  } else {
    console.log('未抓到动态代码');
  }
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
