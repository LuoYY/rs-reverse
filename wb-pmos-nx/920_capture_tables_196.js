/**
 * 920_capture_tables_196.js
 * 捕获 _\$oU/_\$f$/_\$oP/_\$lC/_\$ll 的完整 196 字符串表（在 jc=227 时）
 * 关键：这些表都是 arr:196，内容不同，提供给 Node 执行器
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
        const op227Pos = src.scriptSource.indexOf('_$jc===227');
        if (op227Pos >= 0) {
          try {
            await cdp.send('Debugger.setBreakpoint', {
              location: { scriptId: params.scriptId, lineNumber: 0, columnNumber: op227Pos },
            });
            console.log('[breakpoint] _$jc===227 @col ' + op227Pos);
          } catch (e) {
            console.log('[breakpoint] 失败:', e.message.substring(0, 50));
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
      const expr = `(function(){
        var out = {};
        try { out.fn = arguments.callee.name; } catch(e){ out.fn = '?'; }
        out.jc = typeof _$jc !== 'undefined' ? _$jc : '?';
        // 捕获所有 196 表完整内容
        var tables = ['_$oU', '_$f$', '_$oP', '_$lC', '_$ll', '_$b1', '_$lc'];
        for (var t = 0; t < tables.length; t++) {
          var name = tables[t];
          try {
            var v = eval(name);
            if (Array.isArray(v) && v.length <= 300) {
              out[name] = { type: 'array', len: v.length, val: v.map(function(x){ return typeof x === 'string' ? x : (x === undefined ? 'undef' : (x === null ? 'null' : typeof x)); }) };
            } else if (typeof v === 'undefined') {
              out[name] = 'undef';
            } else {
              out[name] = { type: typeof v, val: typeof v === 'number' ? v : String(v).substring(0, 50) };
            }
          } catch(e){ out[name] = 'err:' + e.message; }
        }
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        console.log('pause#' + pauseCount + ' jc=' + d.jc + ' tabs: ' + Object.keys(d).filter(k => k !== 'fn' && k !== 'jc').map(k => k + '=' + (d[k] && d[k].type === 'array' ? d[k].len : '?')).join(' '));
        if (d.jc === 227) {
          captured = true;
          fs.writeFileSync('/tmp/nx_tables_196.json', JSON.stringify(d, null, 1));
          console.log('已保存 /tmp/nx_tables_196.json');
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