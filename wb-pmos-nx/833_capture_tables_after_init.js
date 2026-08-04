/**
 * 833_capture_tables_after_init.js
 * 捕获 VM 初始化后的全局表（数组值）
 * 方法：在 _$c4 内部断点（非首行），等表初始化后捕获
 * 用 _\$k0 存在作为初始化标志
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
  let best = null;

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (captured) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        console.log('[scriptParsed] 找到 _$c4 脚本');
        // 在 _$c4 函数体内部设断点（让 VM 初始化）
        // 找一个 opcode 处理位置（如 offset 82400 附近）
        // 用行号：把脚本按行分，找 _\$c4 内部
        const c4Pos = src.scriptSource.indexOf('function _$c4');
        const line = src.scriptSource.substring(0, c4Pos).split('\n').length - 1;
        // 在 _\$c4 函数体第 10 行（内部，已初始化）
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: line + 10 });
          console.log('[breakpoint] _$c4 函数体断点 @line ' + (line + 10));
        } catch (e) {
          console.log('[breakpoint] 失败:', e.message.substring(0, 60));
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
        var TABLES = ['_$k0','_$mD','_$a2','_$oU','_$b1','_$lc','_$oN','_$e5','_$k2','_$mv','_$kH','_$no','_$c2','_$aw','_$ip','_$gq','_$eB','_$ae','_$cr','_$bk','_$pL','_$cg','_$ez','_$gc','_$pb','_$nx','_$cQ','_$T','_$G','_$x'];
        for (var ti = 0; ti < TABLES.length; ti++) {
          var name = TABLES[ti];
          try {
            var v = eval(name);
            if (typeof v === 'undefined') continue;
            if (Array.isArray(v)) {
              // 数组完整值（若 < 5000）
              if (v.length < 5000) {
                // 序列化：函数/对象转签名
                var arr = [];
                var ok = true;
                for (var j = 0; j < v.length; j++) {
                  var item = v[j];
                  var t = typeof item;
                  if (item === null) arr.push('null');
                  else if (t === 'number') arr.push(item);
                  else if (t === 'string') arr.push(item);
                  else if (t === 'boolean') arr.push(item);
                  else if (t === 'function') arr.push('fn:' + (item.name || 'anon'));
                  else if (t === 'object') arr.push('obj:' + (item.constructor ? item.constructor.name : '?'));
                  else arr.push(t);
                }
                out[name] = { type: 'array', len: v.length, val: arr };
              } else {
                out[name] = { type: 'array', len: v.length, big: true };
              }
            } else if (typeof v === 'function') {
              out[name] = { type: 'function', name: v.name, src: String(v).substring(0, 200) };
            } else if (typeof v === 'object') {
              out[name] = { type: 'object', keys: Object.keys(v).slice(0, 30) };
            } else {
              out[name] = { type: typeof v, val: v };
            }
          } catch(e) { out[name] = { type: 'err', msg: e.message.substring(0, 50) }; }
        }
        return JSON.stringify(out);
      })()`;
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId, expression: expr, returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        // 检查是否有数组值（非纯函数）
        const arrCount = Object.entries(d).filter(([k, info]) => info.type === 'array').length;
        if (arrCount > 0 && d._$k0 && d._$k0.type === 'array') {
          console.log('pause#' + pauseCount + ' 数组表: ' + Object.entries(d).filter(([k,i]) => i.type === 'array').map(([k,i]) => k + '=' + i.len).join(', '));
          if (!best || arrCount > Object.entries(best).filter(([k,i]) => i.type === 'array').length) {
            best = d;
            console.log('  ★ 最佳捕获，保存');
            fs.writeFileSync('/tmp/nx_vm_tables_init.json', JSON.stringify(d, null, 1));
          }
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