/**
 * 824_capture_inputs.js
 * 捕获 eval JS 的运行时输入：$_ts.scj + $_ts.aebi
 * 关键：eval JS 是 (function(_$$5,_$lP){...})(_$ts.scj,$_ts.aebi)
 * 捕获 scj 和 aebi 的值，用于 Node 中复现 VM 执行
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  await page.route('**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    try {
      if (pathname === '/') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
      const file = path.join(MOCK_DIR, pathname);
      if (fs.existsSync(file)) {
        await route.fulfill({ status: 200, contentType: pathname.endsWith('.js') ? 'application/javascript' : 'text/plain', body: fs.readFileSync(file, 'utf8') });
        return;
      }
    } catch (e) {}
    await route.continue().catch(() => {});
  });

  // 注入：捕获 eval 代码 + 输入 scj/aebi + 输出
  await page.addInitScript(() => {
    window.__cap = null;
    const origEval = window.eval;
    window.eval = function (code) {
      try {
        if (typeof code === 'string' && code.length > 10000) {
          window.__evalCode = code;
          window.__evalLen = code.length;
          // 捕获当前 $_ts
          try {
            window.__scj = window._$ts ? window._$ts.scj : null;
            window.__aebi = window._$ts ? window._$ts.aebi : null;
          } catch (e) {}
        }
      } catch (e) {}
      // 执行 eval，捕获结果
      const r = origEval(code);
      // eval 后 $_ts 可能被修改
      try {
        if (window._$ts) {
          window.__tsAfter = JSON.parse(JSON.stringify(window._$ts));
        }
      } catch (e) {}
      return r;
    };
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));

  const res = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({
    evalLen: window.__evalLen || 0,
    scj: window.__scj ? (typeof window.__scj === 'string' ? window.__scj.substring(0, 200) : JSON.stringify(window.__scj).substring(0, 200)) : null,
    scjType: window.__scj ? typeof window.__scj : null,
    aebi: window.__aebi ? (typeof window.__aebi === 'string' ? window.__aebi.substring(0, 200) : JSON.stringify(window.__aebi).substring(0, 200)) : null,
    aebiType: window.__aebi ? typeof window.__aebi : null,
    tsAfterKeys: window.__tsAfter ? Object.keys(window.__tsAfter) : [],
    tsAfter_scj: window.__tsAfter && window.__tsAfter.scj ? (typeof window.__tsAfter.scj === 'string' ? window.__tsAfter.scj.substring(0, 100) : JSON.stringify(window.__tsAfter.scj).substring(0, 100)) : null,
    tsAfter_aebi: window.__tsAfter && window.__tsAfter.aebi ? (typeof window.__tsAfter.aebi === 'string' ? window.__tsAfter.aebi.substring(0, 100) : JSON.stringify(window.__tsAfter.aebi).substring(0, 100)) : null,
  })`, returnByValue: true });
  console.log('[2] 输入捕获:', res.result?.value);

  // 保存完整 scj/aebi
  const full = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({
    scj: window.__scj,
    aebi: window.__aebi,
    evalCode: window.__evalCode,
  })`, returnByValue: true });
  fs.writeFileSync('/tmp/nx_vm_inputs.json', full.result?.value);
  console.log('[3] 已保存 /tmp/nx_vm_inputs.json');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });