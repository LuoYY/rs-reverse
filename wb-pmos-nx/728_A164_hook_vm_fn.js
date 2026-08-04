/**
 * 728_A164_hook_vm_fn.js
 * 从浏览器捕获 _\$\$1（basearr 构造）和 _\$cS（VM 解释器）的完整源码
 * 用 scriptParsed + getScriptSource 找到 dynCode 源码段
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
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

  // 收集所有 eval 脚本源码（dynCode）
  const dynScripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    if (p.url === '' && p.scriptId) {
      dynScripts.push({ scriptId: p.scriptId, length: p.length });
    }
  });

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

  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));

  // 获取所有 eval 脚本源码
  let dynCode = null;
  for (const s of dynScripts) {
    if (s.length < 100000) continue;
    try {
      const r = await cdp.send('Debugger.getScriptSource', { scriptId: s.scriptId });
      const src = r.scriptSource || '';
      if (src.length > dynCode?.length) {
        dynCode = src;
        console.log('dynCode len:', src.length, 'scriptId:', s.scriptId);
      }
    } catch (e) {}
  }
  if (dynCode) {
    fs.writeFileSync('/tmp/nx_browser_dyncode_final.js', dynCode);
    console.log('已保存 /tmp/nx_browser_dyncode_final.js');
  } else {
    console.log('未捕获 dynCode');
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
