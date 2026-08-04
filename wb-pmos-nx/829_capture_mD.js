/**
 * 829_capture_mD.js
 * 捕获 VM 全局对象表 _$mD（89 个全局对象）
 * 方法：scriptParsed 找 _$c4 脚本，首行断点，帧内 evaluate _$mD
 * _$mD 是 VM 全局映射（document/navigator/window/Canvas 等）
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
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId);
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: 0 });
          console.log('[breakpoint] 首行断点');
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
          try { out.mD = typeof _$mD !== 'undefined' ? JSON.stringify(Array.from(_$mD)) : 'undef'; } catch(e){ out.mD = 'err:' + e.message; }
          try { out.cg = typeof _$cg !== 'undefined' ? JSON.stringify(Array.from(_$cg)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.ez = typeof _$ez !== 'undefined' ? JSON.stringify(Array.from(_$ez)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.pL = typeof _$pL !== 'undefined' ? JSON.stringify(Array.from(_$pL)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.gc = typeof _$gc !== 'undefined' ? JSON.stringify(Array.from(_$gc)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.pb = typeof _$pb !== 'undefined' ? JSON.stringify(Array.from(_$pb)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.nx = typeof _$nx !== 'undefined' ? JSON.stringify(Array.from(_$nx)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.cQ = typeof _$cQ !== 'undefined' ? JSON.stringify(Array.from(_$cQ)).substring(0, 200) : 'undef'; } catch(e){}
          try { out.fn = f0 && f0.functionName ? f0.functionName : 'unknown'; } catch(e){}
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v && v.includes('mD') && !v.includes('undef')) {
        const d = JSON.parse(v);
        if (d.mD && d.mD !== 'undef') {
          console.log('★★★ pause#' + pauseCount + ' 捕获 _$mD! len=' + d.mD.length);
          captured = true;
          fs.writeFileSync('/tmp/nx_mD.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_mD.json');
        }
      }
      if (pauseCount % 20 === 0) console.log('pause#' + pauseCount + ' mD=' + (v ? v.substring(0, 50) : '无'));
    } catch (e) {}
    if (pauseCount > 300) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });