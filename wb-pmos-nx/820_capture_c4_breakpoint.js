/**
 * 820_capture_c4_breakpoint.js
 * 捕获 VM 主解释器 _$c4 的调用（base 生成 program）
 * 方法：监听 scriptParsed，找到含 _$c4 的 eval 脚本，在 _$c4 函数体设置断点
 * 断点命中时检查调用帧参数（program）+ 输出数组（base 179）
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
  let c4Breakpoint = null;
  let captures = [];
  let done = false;

  // 监听脚本解析，找含 _$c4 的 VM 脚本
  cdp.on('Debugger.scriptParsed', async (params) => {
    if (done || c4ScriptId) return;
    try {
      // 只检查 eval 脚本（无 URL 或 url 含 eval）
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        c4ScriptId = params.scriptId;
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId + ' url=' + params.url + ' len=' + src.scriptSource.length);
        // 在 _$c4 函数体设置断点（找 function _$c4 的位置）
        const fnPos = src.scriptSource.indexOf('function _$c4');
        const line = src.scriptSource.substring(0, fnPos).split('\n').length - 1;
        const col = fnPos - src.scriptSource.lastIndexOf('\n', fnPos) - 1;
        try {
          c4Breakpoint = await cdp.send('Debugger.setBreakpointByUrl', {
            scriptId: params.scriptId,
            lineNumber: line,
            columnNumber: col,
          });
          console.log('[breakpoint] 已设置 _$c4 断点 @line ' + line + ' col ' + col);
        } catch (e) {
          console.log('[breakpoint] 设置失败:', e.message.substring(0, 80));
        }
      }
    } catch (e) {}
  });

  // 断点命中处理
  cdp.on('Debugger.paused', async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      if (f0 && f0.functionName === '_$c4') {
        // 捕获 program（第一个参数 _$cg）+ 检查输出数组
        const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f0.callFrameId,
          expression: `(function(){
            var out = {};
            try { out.arg0 = (typeof _$cg !== 'undefined' && _$cg) ? JSON.stringify(Array.from(_$cg)).substring(0, 200) : String(_$cg); } catch(e){}
            try { out.arg1 = (typeof _$ez !== 'undefined' && _$ez) ? JSON.stringify(Array.from(_$ez)).substring(0, 200) : String(_$ez); } catch(e){}
            try { if (typeof _$_T !== 'undefined') out.T = JSON.stringify((_$_T||[]).slice(0, 300)); } catch(e){}
            try { if (typeof _$k0 !== 'undefined') out.k0 = JSON.stringify((_$k0||[]).slice(0, 300)); } catch(e){}
            try { if (typeof _$_G !== 'undefined') out.G = JSON.stringify((_$_G||[]).slice(0, 300)); } catch(e){}
            try { if (typeof _$cr !== 'undefined') out.cr = JSON.stringify((_$cr||[]).slice(0, 300)); } catch(e){}
            try { if (typeof _$$x !== 'undefined') out.x = JSON.stringify((_$$x||[]).slice(0, 300)); } catch(e){}
            return JSON.stringify(out);
          })()`,
          returnByValue: true,
        });
        const v = rr.result?.value;
        if (v) {
          const d = JSON.parse(v);
          // 检查是否有 179 开头数组
          const all = [d.T, d.k0, d.G, d.cr, d.x].filter(Boolean).join(' ');
          if (all.includes('179')) {
            console.log('★★★ 发现 base(179) 相关!');
            captures.push({ frame: 'c4', data: d });
            done = true;
            fs.writeFileSync('/tmp/nx_c4_base.json', JSON.stringify(d, null, 1));
            console.log('已保存 /tmp/nx_c4_base.json');
          }
        }
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, c4ScriptId=' + c4ScriptId, 'captures=' + captures.length, 'done=' + done);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });