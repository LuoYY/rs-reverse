/**
 * 826_fix_input_capture.js
 * 修复输入捕获：捕获 $_ts.scj + $_ts.aebi（eval 时）
 * 关键：eval JS 尾部是 })($_ts.scj,$_ts.aebi)，变量名是 $_ts（不是 _$ts）
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

  // 注入：捕获 eval 时的 $_ts.scj + $_ts.aebi
  await page.addInitScript(() => {
    window.__input = null;
    const origEval = window.eval;
    window.eval = function (code) {
      try {
        if (typeof code === 'string' && code.length > 10000) {
          // 捕获 $_ts 全局（eval 内部引用 $_ts）
          // $_ts 可能是全局变量或 window 属性
          let ts = null;
          try { ts = window.$_ts; } catch (e) {}
          if (!ts) { try { ts = eval('typeof $_ts !== "undefined" ? $_ts : null'); } catch (e) {} }
          if (ts) {
            window.__input = {
              scj: ts.scj,
              aebi: ts.aebi,
              nsd: ts.nsd,
              cd: ts.cd,
              tsKeys: Object.keys(ts),
            };
          }
        }
      } catch (e) {}
      return origEval(code);
    };
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));

  const res = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({
    input: window.__input,
    inputKeys: window.__input ? Object.keys(window.__input) : [],
    scjType: window.__input && window.__input.scj ? typeof window.__input.scj : null,
    aebiType: window.__input && window.__input.aebi ? typeof window.__input.aebi : null,
    scjLen: window.__input && window.__input.scj && typeof window.__input.scj === 'string' ? window.__input.scj.length : null,
    aebiLen: window.__input && window.__input.aebi && window.__input.aebi.length ? window.__input.aebi.length : null,
    aebiHead: window.__input && window.__input.aebi ? Array.from(window.__input.aebi).slice(0, 12) : [],
  })`, returnByValue: true });
  console.log('[2] 输入捕获:', res.result?.value);

  // 保存完整输入
  const full = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify(window.__input)`, returnByValue: true });
  fs.writeFileSync('/tmp/nx_vm_inputs2.json', full.result?.value);
  console.log('[3] 已保存 /tmp/nx_vm_inputs2.json');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });