/**
 * 816_capture_eval.js
 * hook eval 捕获 VM 生成的动态 JS（含 base 生成逻辑）
 * 挑战页 VM opcode 0 = eval（_$aS=_$oQ.eval），VM 通过 eval 生成真正的 base 生成 JS
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

  // 注入 eval hook（addInitScript 最可靠）
  await page.addInitScript(() => {
    window.__evals = [];
    const origEval = window.eval;
    window.eval = function (code) {
      try {
        if (typeof code === 'string' && code.length > 100) {
          window.__evals.push({ code: code, len: code.length, t: Date.now() });
          if (window.__evals.length > 20) window.__evals.shift();
        }
      } catch (e) {}
      return origEval(code);
    };
    // 也 hook Function 构造
    const origFunc = window.Function;
    window.Function = function (...args) {
      try {
        const body = args[args.length - 1];
        if (typeof body === 'string' && body.length > 100) {
          window.__evals.push({ code: 'function(' + args.slice(0, -1).join(',') + ')' + body, len: body.length, t: Date.now(), kind: 'Function' });
          if (window.__evals.length > 20) window.__evals.shift();
        }
      } catch (e) {}
      return origFunc.apply(this, args);
    };
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));

  // 读取捕获的 eval
  const evalsR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__evals || [])', returnByValue: true });
  const evals = JSON.parse(evalsR.result?.value || '[]');
  console.log('[2] 捕获 eval 数:', evals.length);
  evals.forEach((e, i) => {
    console.log('  eval#' + i + ': len=' + e.len + ' kind=' + (e.kind || 'eval') + ' 前100=' + e.code.substring(0, 100).replace(/\n/g, ' '));
  });
  // 保存所有 eval
  fs.writeFileSync('/tmp/nx_evals.json', JSON.stringify(evals, null, 1));
  console.log('[3] 已保存 /tmp/nx_evals.json');

  // 检查是否有 base 生成相关
  const baseEv = evals.filter(e => e.code.includes('179') || e.code.includes('huffman') || e.code.includes('getBasearr') || e.code.includes('numarr'));
  console.log('[4] base 相关 eval:', baseEv.length);
  if (baseEv.length) {
    fs.writeFileSync('/tmp/nx_base_generator.js', baseEv.map(e => e.code).join('\n\n// =====\n\n'));
    console.log('  已保存 /tmp/nx_base_generator.js');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });