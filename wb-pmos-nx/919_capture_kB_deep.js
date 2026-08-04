/**
 * 919_capture_kB_deep.js
 * 修复 918：pL 是 number（1），且 kB 是 undef（断点没命中 _\$kB 初始化）
 * 关键：_\$c4 的 _\$pL 参数是 number（1），不是数组
 * 说明 _\$c4 的 trampoline 调用 _\$pL=1（opcode 值）
 * 而 _\$kB 由 opcode 10 在 _\$c4 外初始化（另一个解释器）
 * 浏览器中 _\$oU=arr:196 是 opcode 725 前已初始化
 * 需捕获 opcode 725 的 _\$kB[0] 实际值
 * 但断点命中在 trampoline（_$pL=1），不是 opcode 725
 * 修正：断点设在 opcode 725 的 _\$oU=_$kB[0] 处（已在 918）
 * 但 918 的断点没命中 opcode 725（pL=1 是 trampoline）
 * 说明 opcode 725 在 _\$c4 内的 _\$jc 分发（需 _\$jc 断点）
 * 用 _$jc===725 断点
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
        // 在 opcode 725 分支（_$jc===725）断点
        const op725Pos = src.scriptSource.indexOf('_$jc===725');
        if (op725Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', {
              location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op725Pos },
            });
            console.log('[breakpoint] _$jc===725 @col ' + op725Pos);
          } catch (e) {
            console.log('[breakpoint] 失败:', e.message.substring(0, 50));
          }
        }
        // 在 opcode 227 分支（_$jc===227）断点
        const op227Pos = src.scriptSource.indexOf('_$jc===227');
        if (op227Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', {
              location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op227Pos },
            });
            console.log('[breakpoint] _$jc===227 @col ' + op227Pos);
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
        out.jc = typeof _$jc !== 'undefined' ? _$jc : '?';
        // _\$kB 完整
        try {
          if (typeof _$kB !== 'undefined') {
            if (Array.isArray(_$kB)) {
              out.kB = { type: 'array', len: _$kB.length, val: Array.from(_$kB).slice(0, 40).map(function(v){ return typeof v === 'number' ? v : (typeof v === 'string' ? 's:' + v.substring(0, 20) : (Array.isArray(v) ? 'a:' + v.length : typeof v)); }) };
            } else {
              out.kB = { type: typeof _$kB, val: String(_$kB).substring(0, 50) };
            }
          } else {
            out.kB = 'undef';
          }
        } catch(e){ out.kB = 'err:' + e.message; }
        // _\$oU
        out.oU = typeof _$oU !== 'undefined' ? (Array.isArray(_$oU) ? 'arr:' + _$oU.length : 'other:' + typeof _$oU) : 'undef';
        out.oU88 = typeof _$oU !== 'undefined' && _$oU ? _$oU[88] : 'N/A';
        // _\$f$
        out.fS = typeof _$f$ !== 'undefined' ? (Array.isArray(_$f$) ? 'arr:' + _$f$.length : 'other:' + typeof _$f$) : 'undef';
        // _\$oP
        out.oP = typeof _$oP !== 'undefined' ? (Array.isArray(_$oP) ? 'arr:' + _$oP.length : 'other:' + typeof _$oP) : 'undef';
        // _\$lC
        out.lC = typeof _$lC !== 'undefined' ? (Array.isArray(_$lC) ? 'arr:' + _$lC.length : 'other:' + typeof _$lC) : 'undef';
        // _\$ll
        out.lL = typeof _$ll !== 'undefined' ? (Array.isArray(_$ll) ? 'arr:' + _$ll.length : 'other:' + typeof _$ll) : 'undef';
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' jc=' + d.jc + ' kB=' + JSON.stringify(d.kB).substring(0, 100) + ' oU=' + d.oU + ' oU88=' + d.oU88 + ' fS=' + d.fS + ' oP=' + d.oP + ' lC=' + d.lC + ' lL=' + d.lL);
        if (d.jc === 725 || d.jc === 227) {
          captured = true;
          fs.writeFileSync('/tmp/nx_kB_capture.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_kB_capture.json (jc=' + d.jc + ')');
        }
      }
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