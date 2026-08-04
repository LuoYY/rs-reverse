/**
 * 874_capture_main_c4.js
 * 捕获主 _\$c4(0) 调用（第一个参数为 0）
 * 关键：之前捕获的 _\$pL [0,52,3,0,5,5,7,7] 是 trampoline 调用的计数表
 * 主调用 _\$c4(0) 的 _\$pL 才是真正的程序表
 * 断点条件：arguments[0] === 0（主 VM 入口）
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

  let captured = false;
  let pauseCount = 0;

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (captured) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        console.log('[scriptParsed] 找到 _$c4 脚本');
        const c4Pos = src.scriptSource.indexOf('function _$c4');
        const line = src.scriptSource.substring(0, c4Pos).split('\n').length - 1;
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: line });
          console.log('[breakpoint] _$c4 断点 @line ' + line);
        } catch (e) {}
      }
    } catch (e) {}
  });

  cdp.on('Debugger.paused', async (params) => {
    if (captured) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    pauseCount++;
    try {
      // 检查当前帧，只捕获主 _\$c4(0) 调用
      const frames = params.callFrames || [];
      const f0 = frames[0];
      // 检查 arguments[0] 是否 0
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `(function(){
          var out = {};
          try { out.arg0 = arguments[0]; } catch(e){ out.arg0 = 'err'; }
          try { out.argLen = arguments.length; } catch(e){}
          try { out.cg = typeof _$cg !== 'undefined' ? JSON.stringify(Array.from(_$cg)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.pL = typeof _$pL !== 'undefined' ? JSON.stringify(Array.from(_$pL)).substring(0, 500) : 'undef'; } catch(e){}
          try { out.ez = typeof _$ez !== 'undefined' ? JSON.stringify(Array.from(_$ez)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.fn = f0.functionName; } catch(e){}
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        // 捕获主调用：arg0 === 0
        if (d.arg0 === 0 && d.pL && d.pL !== 'undef') {
          const pL = JSON.parse(d.pL);
          console.log('★★★ pause#' + pauseCount + ' 主 _\$c4(0) 调用! pL len=' + pL.length + ' 前10=' + pL.slice(0, 10).join(','));
          captured = true;
          fs.writeFileSync('/tmp/nx_main_c4.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_main_c4.json');
        }
        if (pauseCount % 50 === 0) console.log('pause#' + pauseCount + ' arg0=' + d.arg0 + ' pL=' + (d.pL && d.pL !== 'undef' ? '有' : '无'));
      }
    } catch (e) {}
    if (pauseCount > 1000) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });