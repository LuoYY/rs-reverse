/**
 * 868_capture_pL_correct.js
 * 重新捕获 _\$pL（在 _\$c4 调用时，程序表）
 * 关键：之前捕获的 _\$pL [0,52,3,0,5,5,7,7] 是计数表，非程序表
 * _\$c4(_\$cg,_\$ez,_\$pL,_\$gc,_\$pb,_\$nx,_\$cQ) 的 _\$pL 是 aebi[2]（2479B）
 * 检查 aebi 数组与 _\$c4 参数对应
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
        // 在 _$c4 函数开头设断点（捕获参数）
        const c4Pos = src.scriptSource.indexOf('function _$c4');
        const line = src.scriptSource.substring(0, c4Pos).split('\n').length - 1;
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: line });
          console.log('[breakpoint] _$c4 函数断点 @line ' + line);
        } catch (e) {}
      }
    } catch (e) {}
  });

  cdp.on('Debugger.paused', async (params) => {
    if (captured) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    pauseCount++;
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `(function(){
          var out = {};
          try { out.args = arguments.length; } catch(e){}
          try { out.cg = typeof _$cg !== 'undefined' ? JSON.stringify(Array.from(_$cg)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.ez = typeof _$ez !== 'undefined' ? JSON.stringify(Array.from(_$ez)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.pL = typeof _$pL !== 'undefined' ? JSON.stringify(Array.from(_$pL)).substring(0, 300) : 'undef'; } catch(e){}
          try { out.gc = typeof _$gc !== 'undefined' ? JSON.stringify(Array.from(_$gc)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.pb = typeof _$pb !== 'undefined' ? JSON.stringify(Array.from(_$pb)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.nx = typeof _$nx !== 'undefined' ? JSON.stringify(Array.from(_$nx)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.cQ = typeof _$cQ !== 'undefined' ? JSON.stringify(Array.from(_$cQ)).substring(0, 100) : 'undef'; } catch(e){}
          try { out.fn = f0.functionName; } catch(e){}
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v && v.includes('pL')) {
        const d = JSON.parse(v);
        if (d.pL && d.pL !== 'undef' && d.pL.length > 20) {
          console.log('★★★ pause#' + pauseCount + ' 捕获 _$c4 参数! fn=' + d.fn);
          console.log('  pL len:', JSON.parse(d.pL).length);
          console.log('  pL 前 30:', JSON.parse(d.pL).slice(0, 30).join(','));
          captured = true;
          fs.writeFileSync('/tmp/nx_c4_params.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_c4_params.json');
        }
      }
    } catch (e) {}
    if (pauseCount > 200) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });