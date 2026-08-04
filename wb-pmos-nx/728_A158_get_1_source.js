/**
 * 728_A158_get_1_source.js
 * 捕获 _\$\$1（basearr 构造函数）源码——反编译核心
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

  // 捕获 _\$\$1 源码：断点时刻 evaluateOnCallFrame Function.prototype.toString
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 150 && this.length <= 195 && typeof this[0] === "number" && this[0] === 113) ? (window.__cap = Array.from(this), true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__cap ? JSON.stringify(window.__cap.length) : "0"', returnByValue: true });
    if (r.result?.value && +r.result.value >= 150) {
      done = true;
      cdp.off('Debugger.paused', handler);
      const frames = params.callFrames || [];
      // _\$\$1 帧 = frames[0]
      const f0 = frames[0];
      console.log('帧0:', f0.functionName, '@', f0.location.lineNumber, ':', f0.location.columnNumber);
      // 读取 _\$\$1 函数源码
      try {
        const src = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f0.callFrameId,
          expression: `JSON.stringify({src: $${f0.functionName}.toString().substring(0, 3000), len: $${f0.functionName}.toString().length})`,
          returnByValue: true,
        });
        console.log('_\$\$1 源码:', src.result?.value);
        fs.writeFileSync('/tmp/nx_browser_1_source.json', src.result?.value || 'null');
      } catch (e) { console.log('读源码失败:', e.message.substring(0, 100)); }
      // 读 _\$cS 帧的 _\$gx（bytecode）
      try {
        const f1 = frames[1];
        const bc = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f1.callFrameId,
          expression: 'typeof _$gx !== "undefined" ? JSON.stringify({arr:Array.isArray(_$gx)?_$gx.slice(0,100):null,len:Array.isArray(_$gx)?_$gx.length:null,type:typeof _$gx}) : "nogx"',
          returnByValue: true,
        });
        console.log('_\$cS._\$gx:', bc.result?.value);
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
