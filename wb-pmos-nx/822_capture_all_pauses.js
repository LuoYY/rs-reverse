/**
 * 822_capture_all_pauses.js
 * 捕获所有 pause 的 VM 状态（含 base 数组）
 * 修复 821：只检查第1个179就停，实际 base 数组在后续 pause
 * 改为：捕获所有 pause，检查 k0/T 中是否有 [0]===179 的数组元素
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
  let allCaptures = [];
  let done = false;
  let pauseCount = 0;

  cdp.on('Debugger.scriptParsed', async (params) => {
    if (done || c4ScriptId) return;
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: params.scriptId });
      if (src.scriptSource && src.scriptSource.includes('function _$c4') && src.scriptSource.length > 100000) {
        c4ScriptId = params.scriptId;
        console.log('[scriptParsed] 找到 _$c4 脚本: scriptId=' + params.scriptId);
        // 首行断点
        try {
          await cdp.send('Debugger.setBreakpointByUrl', { scriptId: params.scriptId, lineNumber: 0 });
          console.log('[breakpoint] 脚本首行断点');
        } catch (e) {}
      }
    } catch (e) {}
  });

  cdp.on('Debugger.paused', async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    pauseCount++;
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `(function(){
          var out = {};
          try { if (typeof _$k0 !== 'undefined') out.k0 = JSON.stringify(Array.from(_$k0)); } catch(e){}
          try { if (typeof _$_T !== 'undefined') out.T = JSON.stringify((_$_T||[])); } catch(e){}
          try { if (typeof _$cr !== 'undefined') out.cr = JSON.stringify((_$cr||[])); } catch(e){}
          try { if (typeof _$_G !== 'undefined') out.G = JSON.stringify((_$_G||[])); } catch(e){}
          try { if (typeof _$ez !== 'undefined') out.ez = typeof _$ez === 'string' ? _$ez : JSON.stringify((_$ez||[])); } catch(e){}
          try { if (typeof _$cg !== 'undefined') out.cg = typeof _$cg === 'string' ? _$cg : JSON.stringify((_$cg||[])); } catch(e){}
          return JSON.stringify(out);
        })()`,
        returnByValue: true,
      });
      const v = rr.result?.value;
      if (v) {
        const d = JSON.parse(v);
        // 检查 k0 中是否有 [0]===179 数组
        let foundBase = false;
        ['k0', 'T', 'cr', 'G'].forEach(k => {
          if (d[k]) {
            try {
              const arr = JSON.parse(d[k]);
              if (Array.isArray(arr)) {
                for (let i = 0; i < arr.length; i++) {
                  if (Array.isArray(arr[i]) && arr[i][0] === 179) {
                    foundBase = true;
                    console.log('★★★ pause#' + pauseCount + ' [' + k + '][' + i + '] base! len=' + arr[i].length + ' head=' + arr[i].slice(0, 12).join(','));
                  }
                }
              }
            } catch (e) {}
          }
        });
        if (foundBase) {
          allCaptures.push({ pause: pauseCount, data: d, found: true });
          done = true;
          fs.writeFileSync('/tmp/nx_c4_all.json', JSON.stringify(allCaptures, null, 1));
          console.log('已保存 /tmp/nx_c4_all.json');
        } else if (pauseCount <= 30) {
          allCaptures.push({ pause: pauseCount, data: d, found: false });
        }
      }
    } catch (e) {}
    if (pauseCount > 300) done = true;
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成, pauses=' + pauseCount + ' captured=' + allCaptures.length + ' done=' + done);
  if (allCaptures.length) fs.writeFileSync('/tmp/nx_c4_all.json', JSON.stringify(allCaptures, null, 1));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });