/**
 * 918_capture_kB.js
 * 捕获 _\$kB 和 _\$pL 的完整值（解开 opcode 725 的 _\$oU=_$kB[0]）
 * 关键：浏览器中 _\$oU=arr:196，说明 _\$kB[0] 是 196 长度数组
 * 需确认 _\$kB 和 _\$pL 的真实结构
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
        // 在 opcode 725 断点（_$oU=_$kB[0]）
        const op725Pos = src.scriptSource.indexOf('_$oU=_$kB[0]');
        if (op725Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', {
              location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op725Pos },
            });
            console.log('[breakpoint] opcode725 @col ' + op725Pos);
          } catch (e) {
            console.log('[breakpoint] 失败:', e.message.substring(0, 50));
          }
        }
        // 在 opcode 10 断点（_$kB=_$pL[0]）
        const op10Pos = src.scriptSource.indexOf('_$kB=_$pL[0]');
        if (op10Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', {
              location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op10Pos },
            });
            console.log('[breakpoint] opcode10 @col ' + op10Pos);
          } catch (e) {}
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
        try { out.fn = arguments.callee.name; } catch(e){ out.fn = '?'; }
        out.col = '?';
        // _\$kB 完整
        try {
          if (typeof _$kB !== 'undefined') {
            if (Array.isArray(_$kB)) {
              out.kB = { type: 'array', len: _$kB.length, val: Array.from(_$kB).slice(0, 30).map(function(v){ return typeof v === 'number' ? v : (typeof v === 'string' ? 's:' + v.substring(0,20) : (Array.isArray(v) ? 'a:' + v.length : typeof v)); }) };
            } else {
              out.kB = { type: typeof _$kB, val: String(_$kB).substring(0, 50) };
            }
          } else {
            out.kB = 'undef';
          }
        } catch(e){ out.kB = 'err:' + e.message; }
        // _\$pL 完整
        try {
          if (typeof _$pL !== 'undefined') {
            if (Array.isArray(_$pL)) {
              out.pL = { type: 'array', len: _$pL.length, first: _$pL.slice(0, 5).map(function(v){ return Array.isArray(v) ? 'a:' + v.length : (typeof v === 'number' ? v : typeof v); }) };
            } else {
              out.pL = { type: typeof _$pL, val: String(_$pL).substring(0, 50) };
            }
          } else {
            out.pL = 'undef';
          }
        } catch(e){ out.pL = 'err:' + e.message; }
        // _\$oU
        out.oU = typeof _$oU !== 'undefined' ? (Array.isArray(_$oU) ? 'arr:' + _$oU.length : 'other:' + typeof _$oU) : 'undef';
        // _\$ez
        out.ez = typeof _$ez !== 'undefined' ? (typeof _$ez === 'string' ? 'str:' + _$ez.length : 'other:' + typeof _$ez) : 'undef';
        // _\$cg
        out.cg = typeof _$cg !== 'undefined' ? (Array.isArray(_$cg) ? 'arr:' + _$cg.length : (typeof _$cg === 'number' ? 'num:' + _$cg : typeof _$cg)) : 'undef';
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' col=' + d.col + ' kB=' + JSON.stringify(d.kB).substring(0, 120) + ' pL=' + JSON.stringify(d.pL).substring(0, 120) + ' oU=' + d.oU + ' ez=' + d.ez + ' cg=' + d.cg);
        if (d.kB && d.kB.type === 'array' && d.kB.len > 100) {
          captured = true;
          fs.writeFileSync('/tmp/nx_kB_capture.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_kB_capture.json');
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