/**
 * 942_capture_op6_ez.js
 * 捕获 opcode 6 执行时 _\$ez 的真实值（_$mP=_$nP(_$ez)）
 * 关键：_\$ez 是 _$nP 表生成器的输入，决定 _\$mP/_\$k0 等表
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
        // opcode 6 分支（_$mP=_$nP(_$ez)）
        const op6Pos = src.scriptSource.indexOf('_$mP=_$nP(_$ez)');
        if (op6Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', { location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op6Pos } });
            console.log('[breakpoint] opcode6 @col ' + op6Pos);
          } catch (e) { console.log('[breakpoint] op6 失败:', e.message.substring(0, 40)); }
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
        // _\$ez
        try {
          if (typeof _$ez !== 'undefined') {
            if (typeof _$ez === 'string') out.ez = { type: 'str', len: _$ez.length, first: _$ez.substring(0, 50) };
            else if (Array.isArray(_$ez)) out.ez = { type: 'arr', len: _$ez.length, first: _$ez.slice(0, 10) };
            else out.ez = { type: typeof _$ez, val: String(_$ez).substring(0, 50) };
          } else out.ez = 'undef';
        } catch(e){ out.ez = 'err'; }
        // _\$nP
        try {
          if (typeof _$nP !== 'undefined') out.nP = { type: 'fn', src: String(_$nP).substring(0, 100) };
          else out.nP = 'undef';
        } catch(e){ out.nP = 'err'; }
        // _\$cg
        try { out.cg = typeof _$cg !== 'undefined' ? (Array.isArray(_$cg) ? 'arr:' + _$cg.length : (typeof _$cg === 'number' ? 'num:' + _$cg : typeof _$cg)) : 'undef'; } catch(e){ out.cg = 'err'; }
        // _\$pL
        try { out.pL = typeof _$pL !== 'undefined' ? (Array.isArray(_$pL) ? 'arr:' + _$pL.length : (typeof _$pL === 'number' ? 'num:' + _$pL : typeof _$pL)) : 'undef'; } catch(e){ out.pL = 'err'; }
        // _\$gc/_\$pb/_\$nx/_\$cQ
        try { out.gc = typeof _$gc !== 'undefined' ? (Array.isArray(_$gc) ? 'arr:' + _$gc.length : typeof _$gc) : 'undef'; } catch(e){ out.gc = 'err'; }
        try { out.pb = typeof _$pb !== 'undefined' ? (Array.isArray(_$pb) ? 'arr:' + _$pb.length : typeof _$pb) : 'undef'; } catch(e){ out.pb = 'err'; }
        try { out.nx = typeof _$nx !== 'undefined' ? (Array.isArray(_$nx) ? 'arr:' + _$nx.length : typeof _$nx) : 'undef'; } catch(e){ out.nx = 'err'; }
        try { out.cQ = typeof _$cQ !== 'undefined' ? (Array.isArray(_$cQ) ? 'arr:' + _$cQ.length : typeof _$cQ) : 'undef'; } catch(e){ out.cQ = 'err'; }
        // _\$lP
        try { out.lP = typeof _$lP !== 'undefined' ? (Array.isArray(_$lP) ? 'arr:' + _$lP.length + ' elems:' + _$lP.map(function(v){ return Array.isArray(v) ? 'a:' + v.length : typeof v; }).join(',') : typeof _$lP) : 'undef'; } catch(e){ out.lP = 'err'; }
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' fn=' + d.fn + ' ez=' + JSON.stringify(d.ez).substring(0, 80) + ' cg=' + d.cg + ' pL=' + d.pL);
        console.log('  gc=' + d.gc + ' pb=' + d.pb + ' nx=' + d.nx + ' cQ=' + d.cQ);
        console.log('  lP=' + JSON.stringify(d.lP).substring(0, 200));
        if (d.ez && d.ez !== 'undef') {
          captured = true;
          fs.writeFileSync('/tmp/nx_op6_state.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_op6_state.json');
        }
      }
    } catch (e) {}
    if (pauseCount > 500) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });