/**
 * 821_capture_full_k0.js
 * 捕获 VM 主解释器 _$c4 的完整 _$k0 数据表 + 全部程序参数（不截断）
 * 修复 820：k0 只捕获 300 截断，且 arg0 是空数组
 * 目标：捕获含 base 的完整数据表 + 程序
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

  let c4ScriptId = null;
  let captures = [];
  let done = false;
  let pauseCount = 0;

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (done || c4ScriptId) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        c4ScriptId = params.scriptId;
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId + ' len=' + src.scriptSource.length);
        // 用 setBreakpointByUrl 需要 url；eval 脚本 url 为空，改用 Runtime 断点
        // 方案：在脚本内找到 _$c4 函数定义行，用 setBreakpointByUrl 需要 url
        // 改用 setBreakpointOnFunctionCall：先获取 _$c4 函数对象
        // 但 _$c4 在 eval 作用域内，无法从 window 获取
        // 方案：在脚本第一行断点（脚本加载时），然后手动调用 _$c4
        // 更简单：在脚本第一行断点，捕获全部！
        try {
          const bp = await cdp.send('Debugger.setBreakpointByUrl', {
            url: params.url || undefined,
            scriptId: params.scriptId,
            lineNumber: 0,
          });
          console.log('[breakpoint] 脚本首行断点 @line0');
        } catch (e) {
          console.log('[breakpoint] 首行断点失败:', e.message.substring(0, 80));
        }
      }
    } catch (e) {}
  });

  cdp.on('Debugger.paused', async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    pauseCount++;
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      // 检查当前执行位置（可能在 _$c4 内部）
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `(function(){
          var out = { fn: 'unknown' };
          try { out.fn = arguments.callee.name; } catch(e){}
          try { if (typeof _$k0 !== 'undefined') out.k0 = JSON.stringify(Array.from(_$k0)); } catch(e){}
          try { if (typeof _$_T !== 'undefined') out.T = JSON.stringify((_$_T||[])); } catch(e){}
          try { if (typeof _$cr !== 'undefined') out.cr = JSON.stringify((_$cr||[])); } catch(e){}
          try { if (typeof _$_G !== 'undefined') out.G = JSON.stringify((_$_G||[])); } catch(e){}
          try { if (typeof _$cg !== 'undefined') out.cg = JSON.stringify((_$cg||[])); } catch(e){}
          try { if (typeof _$ez !== 'undefined') out.ez = JSON.stringify((_$ez||[])); } catch(e){}
          try { if (typeof _$pL !== 'undefined') out.pL = JSON.stringify((_$pL||[])); } catch(e){}
          try { if (typeof _$gc !== 'undefined') out.gc = (typeof _$gc) === 'string' ? _$gc : JSON.stringify((_$gc||[])); } catch(e){}
          try { if (typeof _$pb !== 'undefined') out.pb = (typeof _$pb) === 'string' ? _$pb : JSON.stringify((_$pb||[])); } catch(e){}
          try { if (typeof _$nx !== 'undefined') out.nx = (typeof _$nx) === 'string' ? _$nx : JSON.stringify((_$nx||[])); } catch(e){}
          try { if (typeof _$cQ !== 'undefined') out.cQ = (typeof _$cQ) === 'string' ? _$cQ : JSON.stringify((_$cQ||[])); } catch(e){}
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        // 检查是否有 base（179 开头数组）
        const all = [d.k0, d.T, d.cr, d.G, d.cg, d.ez, d.pL, d.gc, d.pb, d.nx, d.cQ].filter(Boolean).join(' ');
        if (all.includes('179')) {
          console.log('★★★ pause#' + pauseCount + ' 发现 179: fn=' + d.fn);
          captures.push({ pause: pauseCount, fn: d.fn, data: d });
          if (captures.length >= 1) {
            done = true;
            fs.writeFileSync('/tmp/nx_c4_full.json', JSON.stringify(captures, null, 1));
            console.log('已保存 /tmp/nx_c4_full.json');
          }
        }
        if (pauseCount % 20 === 0) console.log('pause#' + pauseCount + ' fn=' + d.fn + ' k0len=' + (d.k0 ? JSON.parse(d.k0).length : 0));
      }
    } catch (e) {}
    if (pauseCount > 500) done = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captures=' + captures.length + ' done=' + done);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });