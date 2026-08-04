/**
 * 911_capture_error_point.js
 * 在浏览器中捕获 opcode 227 错误点（_$a2[_$oU[88]]）的完整状态
 * 关键：直接看浏览器中 _\$oU 在错误点的真实值 + 完整调用栈
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
        // 在 _\$a2[_$oU[88]] 位置设断点（opcode 227）
        const targetPos = src.scriptSource.indexOf('_$a2[_$oU[88]]');
        if (targetPos >= 0) {
          const line = src.scriptSource.substring(0, targetPos).split('\n').length - 1;
          try {
            await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: line });
            console.log('[breakpoint] opcode 227 断点 @line ' + line);
          } catch (e) {
            console.log('[breakpoint] 失败:', e.message.substring(0, 60));
          }
        } else {
          console.log('[warn] 未找到 _\$a2[_$oU[88]]');
          // 设置函数入口断点作为后备
          const c4Pos = src.scriptSource.indexOf('function _$c4');
          const line = src.scriptSource.substring(0, c4Pos).split('\n').length - 1;
          try {
            await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: line });
            console.log('[breakpoint][fallback] _$c4 入口断点 @line ' + line);
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
      // 捕获 _\$oU 真实值 + 完整调用栈
      const expr = `(function(){
        var out = {};
        out.fn = f0.functionName;
        out.oU = typeof _$oU !== 'undefined' ? (Array.isArray(_$oU) ? 'array:' + _$oU.length : 'other:' + typeof _$oU) : 'undef';
        out.oU88 = typeof _$oU !== 'undefined' && _$oU ? _$oU[88] : 'N/A';
        out.oU176 = typeof _$oU !== 'undefined' && _$oU ? _$oU[176] : 'N/A';
        out.a2 = typeof _$a2 !== 'undefined' ? 'defined' : 'undef';
        out.kB = typeof _$kB !== 'undefined' ? 'defined' : 'undef';
        out.oP = typeof _$oP !== 'undefined' ? 'defined:' + (_$oP.length) : 'undef';
        out.fS = typeof _$f$ !== 'undefined' ? 'defined:' + (_$f$.length) : 'undef';
        out.lC = typeof _$lC !== 'undefined' ? 'defined:' + (_$lC.length) : 'undef';
        out.lL = typeof _$ll !== 'undefined' ? 'defined:' + (_$ll.length) : 'undef';
        out.jR = typeof _$jR !== 'undefined' ? 'defined' : 'undef';
        out.d5 = typeof _$d5 !== 'undefined' ? 'defined' : 'undef';
        out.mD = typeof _$mD !== 'undefined' ? 'defined:' + (_$mD.length) : 'undef';
        out.k0 = typeof _$k0 !== 'undefined' ? 'defined:' + (_$k0.length) : 'undef';
        out.jc = typeof _$jc !== 'undefined' ? _$jc : '?';
        out.oL = typeof _$oL !== 'undefined' ? _$oL : '?';
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' fn=' + d.fn + ' oU=' + d.oU + ' oU88=' + d.oU88 + ' jc=' + d.jc + ' oL=' + d.oL);
        if (d.fn === '_$c4' && d.oU && d.oU.startsWith('array')) {
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