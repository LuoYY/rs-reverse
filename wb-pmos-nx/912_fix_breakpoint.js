/**
 * 912_fix_breakpoint.js
 * 修复断点：用 setBreakpointByUrl 的 url 参数（脚本 url 可能为空）
 * 关键：eval 脚本 url 为空，需用 scriptId 方式
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
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId + ' url=' + params.url);
        // 用 setBreakpoint（按 scriptId + 行号）
        const targetPos = src.scriptSource.indexOf('_$a2[_$oU[88]]');
        const line = targetPos >= 0
          ? src.scriptSource.substring(0, targetPos).split('\n').length - 1
          : src.scriptSource.substring(0, src.scriptSource.indexOf('function _$c4')).split('\n').length - 1;
        try {
          const bp = await cdp.send('Debugger.setBreakpoint', {
            location: { scriptId: params.scriptId, lineNumber: line },
          });
          console.log('[breakpoint] 断点 @line ' + line + ' bpId=' + bp.breakpointId);
        } catch (e) {
          console.log('[breakpoint] 失败:', e.message.substring(0, 80));
        }
      }
    } catch (e) {}
  });

  cdp.on('Debugger.paused', async (params) => {
    if (captured) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    pauseCount++;
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      const expr = `(function(){
        var out = {};
        out.fn = f0.functionName;
        out.oU = typeof _$oU !== 'undefined' ? (Array.isArray(_$oU) ? 'array:' + _$oU.length : 'other:' + typeof _$oU) : 'undef';
        out.oU88 = typeof _$oU !== 'undefined' && _$oU ? _$oU[88] : 'N/A';
        out.a2 = typeof _$a2 !== 'undefined' ? 'defined' : 'undef';
        out.jc = typeof _$jc !== 'undefined' ? _$jc : '?';
        out.oL = typeof _$oL !== 'undefined' ? _$oL : '?';
        out.kB = typeof _$kB !== 'undefined' ? 'defined' : 'undef';
        out.oP = typeof _$oP !== 'undefined' ? 'defined:' + (_$oP.length) : 'undef';
        out.fS = typeof _$f$ !== 'undefined' ? 'defined:' + (_$f$.length) : 'undef';
        out.lC = typeof _$lC !== 'undefined' ? 'defined:' + (_$lC.length) : 'undef';
        out.mD = typeof _$mD !== 'undefined' ? 'defined:' + (_$mD.length) : 'undef';
        out.k0 = typeof _$k0 !== 'undefined' ? 'defined:' + (_$k0.length) : 'undef';
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' fn=' + d.fn + ' oU=' + d.oU + ' oU88=' + d.oU88 + ' jc=' + d.jc + ' oL=' + d.oL + ' oP=' + d.oP + ' fS=' + d.fS + ' lC=' + d.lC + ' mD=' + d.mD + ' k0=' + d.k0);
        if (d.oU && d.oU.startsWith('array')) {
          captured = true;
          fs.writeFileSync('/tmp/nx_error_point.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_error_point.json');
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