/**
 * 938_capture_op1_44.js
 * 在浏览器中精确捕获 opcode 1 和 44 执行时的 _\$cM/_\$kB/_\$pL/_\$aW 真实值
 * 关键：opcode 1 用 _\$cM._\$nZ 构建 _\$kB
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
  let op1State = null;
  let op44State = null;

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (captured) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId);
        // opcode 1 分支（_$pW===1）
        const op1Pos = src.scriptSource.indexOf('_$pW===1');
        if (op1Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', { location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op1Pos } });
            console.log('[breakpoint] opcode1 @col ' + op1Pos);
          } catch (e) { console.log('[breakpoint] op1 失败:', e.message.substring(0, 40)); }
        }
        // opcode 44 分支（_$pW===44）
        const op44Pos = src.scriptSource.indexOf('_$pW===44');
        if (op44Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', { location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op44Pos } });
            console.log('[breakpoint] opcode44 @col ' + op44Pos);
          } catch (e) { console.log('[breakpoint] op44 失败:', e.message.substring(0, 40)); }
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
        out.pW = typeof _$pW !== 'undefined' ? _$pW : '?';
        // _\$kB
        try {
          if (typeof _$kB !== 'undefined') {
            if (Array.isArray(_$kB)) out.kB = { type: 'array', len: _$kB.length, first: _$kB.slice(0, 3).map(function(v){ return typeof v === 'number' ? v : (typeof v === 'string' ? 's:' + v.substring(0, 20) : typeof v); }) };
            else if (typeof _$kB === 'function') out.kB = { type: 'fn', name: _$kB.name, src: String(_$kB).substring(0, 100) };
            else out.kB = { type: typeof _$kB, val: String(_$kB).substring(0, 50) };
          } else out.kB = 'undef';
        } catch(e){ out.kB = 'err'; }
        // _\$cM
        try {
          if (typeof _$cM !== 'undefined') {
            if (typeof _$cM === 'object') {
              var keys = Object.keys(_$cM);
              out.cM = { type: 'obj', keys: keys.slice(0, 10), nZ: typeof _$cM._$nZ === 'function' ? 'fn:' + _$cM._$nZ.name : String(_$cM._$nZ).substring(0, 30) };
            } else out.cM = { type: typeof _$cM, val: String(_$cM).substring(0, 30) };
          } else out.cM = 'undef';
        } catch(e){ out.cM = 'err'; }
        // _\$pL
        try {
          if (typeof _$pL !== 'undefined') {
            if (Array.isArray(_$pL)) out.pL = { type: 'array', len: _$pL.length, first: _$pL.slice(0, 3).map(function(v){ return typeof v; }) };
            else out.pL = { type: typeof _$pL, val: String(_$pL).substring(0, 30) };
          } else out.pL = 'undef';
        } catch(e){ out.pL = 'err'; }
        // _\$aW
        try {
          if (typeof _$aW !== 'undefined') out.aW = { type: typeof _$aW, src: typeof _$aW === 'function' ? String(_$aW).substring(0, 100) : String(_$aW).substring(0, 30) };
          else out.aW = 'undef';
        } catch(e){ out.aW = 'err'; }
        // _\$cM._\$nZ 返回值
        try {
          if (typeof _$cM !== 'undefined' && _$cM && typeof _$cM._\$nZ === 'function') {
            out.nZCall = String(_$cM._\$nZ()).substring(0, 30);
          } else out.nZCall = 'N/A';
        } catch(e){ out.nZCall = 'err'; }
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' pW=' + d.pW + ' kB=' + JSON.stringify(d.kB).substring(0, 100) + ' cM=' + JSON.stringify(d.cM).substring(0, 80) + ' pL=' + JSON.stringify(d.pL).substring(0, 50) + ' aW=' + JSON.stringify(d.aW).substring(0, 60));
        if (d.pW === 1 && !op1State) {
          op1State = d;
          fs.writeFileSync('/tmp/nx_op1_state.json', JSON.stringify(d, null, 1));
          console.log('已保存 op1 状态');
        }
        if (d.pW === 44 && !op44State) {
          op44State = d;
          fs.writeFileSync('/tmp/nx_op44_state.json', JSON.stringify(d, null, 1));
          console.log('已保存 op44 状态');
        }
        if (op1State && op44State) captured = true;
      }
    } catch (e) {}
    if (pauseCount > 500) captured = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + captured + ' op1=' + !!op1State + ' op44=' + !!op44State);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });