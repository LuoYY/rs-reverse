/**
 * 869_capture_pL_retry.js
 * 重试捕获 _\$c4 参数（捕获失败：pL 条件未满足）
 * 修复：捕获条件更宽松，保存所有 pL 非 undef 的 pause
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
  let allPauses = [];

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
      const frames = params.callFrames || [];
      const f0 = frames[0];
      const evalSource = `(function(){
        var out = {};
        try { out.cg = typeof _$cg !== 'undefined' ? JSON.stringify(Array.from(_$cg)).substring(0, 200) : 'undef'; } catch(e){ out.cg = 'err'; }
        try { out.ez = typeof _$ez !== 'undefined' ? JSON.stringify(Array.from(_$ez)).substring(0, 200) : 'undef'; } catch(e){ out.ez = 'err'; }
        try { out.pL = typeof _$pL !== 'undefined' ? JSON.stringify(Array.from(_$pL)).substring(0, 500) : 'undef'; } catch(e){ out.pL = 'err'; }
        try { out.gc = typeof _$gc !== 'undefined' ? JSON.stringify(Array.from(_$gc)).substring(0, 200) : 'undef'; } catch(e){ out.gc = 'err'; }
        try { out.pb = typeof _$pb !== 'undefined' ? JSON.stringify(Array.from(_$pb)).substring(0, 200) : 'undef'; } catch(e){ out.pb = 'err'; }
        try { out.nx = typeof _$nx !== 'undefined' ? JSON.stringify(Array.from(_$nx)).substring(0, 200) : 'undef'; } catch(e){ out.nx = 'err'; }
        try { out.cQ = typeof _$cQ !== 'undefined' ? JSON.stringify(Array.from(_$cQ)).substring(0, 200) : 'undef'; } catch(e){ out.cQ = 'err'; }
        try { out.fn = f0.functionName; } catch(e){}
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: evalSource, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        allPauses.push({ pause: pauseCount, fn: d.fn, data: d });
        // 保存第一个 pL 非 undef 的
        if (d.pL && d.pL !== 'undef' && d.pL !== 'err') {
          const pL = JSON.parse(d.pL);
          if (pL.length > 100) {
            console.log('★★★ pause#' + pauseCount + ' pL len=' + pL.length + ' 前20=' + pL.slice(0, 20).join(','));
            if (!captured) {
              captured = true;
              fs.writeFileSync('/tmp/nx_c4_params.json', JSON.stringify(d, null, 1));
              console.log('已保存 /tmp/nx_c4_params.json');
            }
          }
        }
        if (pauseCount % 30 === 0) console.log('pause#' + pauseCount + ' fn=' + d.fn + ' pL=' + (d.pL && d.pL !== 'undef' ? '有' : '无'));
      }
    } catch (e) {}
    if (pauseCount > 400) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  if (allPauses.length) fs.writeFileSync('/tmp/nx_c4_all_pauses.json', JSON.stringify(allPauses, null, 1));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });