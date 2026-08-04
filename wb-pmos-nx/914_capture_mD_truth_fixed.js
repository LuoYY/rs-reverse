/**
 * 914_capture_mD_truth_fixed.js
 * 修复 913：表达式里的 f0 是 Node 变量（页面不可用），改用 arguments.callee.name
 * 关键：捕获 _\$mD 完整 truthiness + 所有表在 opcode 227/204/725 处的值
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
  let allStates = [];

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (captured) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId + ' len=' + src.scriptSource.length);
        const positions = [
          { name: 'opcode227', pos: src.scriptSource.indexOf('_$a2[_$oU[88]]') },
          { name: 'opcode204', pos: src.scriptSource.indexOf('_$a2=window') },
          { name: 'opcode725', pos: src.scriptSource.indexOf('_$oU=_$kB[0]') },
        ];
        for (const p of positions) {
          if (p.pos >= 0) {
            try {
              await cdp.send('Debugger.setBreakpoint', {
                location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: p.pos },
              });
              console.log('[breakpoint] ' + p.name + ' @col ' + p.pos);
            } catch (e) {
              console.log('[breakpoint] ' + p.name + ' 失败: ' + e.message.substring(0, 50));
            }
          }
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
      // 表达式：不引用 f0（Node 变量），用 arguments.callee.name
      const expr = `(function(){
        var out = {};
        try { out.fn = arguments.callee.name; } catch(e){ out.fn = '?'; }
        // _\$mD 完整 truthiness + 值
        try {
          if (typeof _$mD !== 'undefined') {
            var truth = [];
            var vals = [];
            for (var i = 0; i < _$mD.length; i++) {
              var v = _$mD[i];
              truth.push(!!v ? 1 : 0);
              if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null || v === undefined) {
                vals.push(v === null ? 'null' : v === undefined ? 'undef' : v);
              } else {
                vals.push(typeof v === 'function' ? 'fn:' + (v.name || 'anon') : 'obj:' + (v.constructor ? v.constructor.name : '?'));
              }
            }
            out.mD = { len: _$mD.length, truth: truth, vals: vals };
          }
        } catch(e){ out.mD = { err: e.message }; }
        // 其他关键表
        out.oU = typeof _$oU !== 'undefined' ? (Array.isArray(_$oU) ? 'arr:' + _$oU.length : 'other:' + typeof _$oU) : 'undef';
        out.oU88 = typeof _$oU !== 'undefined' && _$oU ? _$oU[88] : 'N/A';
        out.kB = typeof _$kB !== 'undefined' ? 'defined' : 'undef';
        out.kB0 = typeof _$kB !== 'undefined' && _$kB ? _$kB[0] : 'N/A';
        out.a2 = typeof _$a2 !== 'undefined' ? 'defined' : 'undef';
        out.jc = typeof _$jc !== 'undefined' ? _$jc : '?';
        out.oP = typeof _$oP !== 'undefined' ? 'arr:' + _$oP.length : 'undef';
        out.fs = typeof _$f$ !== 'undefined' ? 'arr:' + (_$f$.length) : 'undef';
        out.lC = typeof _$lC !== 'undefined' ? 'arr:' + (_$lC.length) : 'undef';
        out.lL = typeof _$ll !== 'undefined' ? 'arr:' + (_$ll.length) : 'undef';
        out.jR = typeof _$jR !== 'undefined' ? 'defined' : 'undef';
        out.d5 = typeof _$d5 !== 'undefined' ? 'defined' : 'undef';
        out.k0 = typeof _$k0 !== 'undefined' ? 'arr:' + (_$k0.length) : 'undef';
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' fn=' + d.fn + ' oU=' + d.oU + ' oU88=' + d.oU88 + ' kB=' + d.kB + ' jc=' + d.jc + ' mDlen=' + (d.mD ? d.mD.len : '?') + ' oP=' + d.oP + ' fs=' + d.fs + ' lC=' + d.lC);
        allStates.push({ pause: pauseCount, ...d });
        if (d.mD && d.mD.truth) {
          fs.writeFileSync('/tmp/nx_mD_truth_' + pauseCount + '.json', JSON.stringify(d.mD));
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
  if (allStates.length) fs.writeFileSync('/tmp/nx_mD_truth_all.json', JSON.stringify(allStates, null, 1));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });