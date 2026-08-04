/**
 * 728_A201_capture_cS_closure.js
 * hook _\$cS（VM 解释器）断点，从闭包 scope 读取 _\$_T（栈数组）+ _\$hr（程序）
 * 捕获 base(179) 生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
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

  await cdp.send('Runtime.evaluate', { expression: 'window.__plain=null;' });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let state = 'waiting';
  let pauses = 0;
  const baseCaps = [];

  const handler = async (params) => {
    if (state === 'waiting') {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          state = 'collecting';
          console.log('★ 明文捕获，开始跟踪 _\$cS 闭包');
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    if (state === 'collecting') {
      pauses++;
      // 找 _\$cS 帧，读闭包中的 _\$_T
      const frames = params.callFrames || [];
      for (const f of frames) {
        if (f.functionName === '_$cS') {
          try {
            // 从 scope chain 找闭包，读 _\$_T
            const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f.callFrameId,
              expression: `JSON.stringify((()=>{var out={};try{if(typeof _$_T!=='undefined')out._$_T=(Array.isArray(_$_T)?_$_T.slice(0,250):'nonarr');}catch(e){}try{if(typeof _$hr!=='undefined')out._$hr=_$hr.map(function(p){if(!p)return null;return {iH:p._$iH,gS:typeof p._$gS==='string'?Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}):null,myLen:(p._$my||[]).length};});}catch(e){}return out;})())`,
              returnByValue: true,
            });
            const v = rr.result?.value;
            if (v) {
              const d = JSON.parse(v);
              if (Array.isArray(d._$_T)) {
                for (let i = 0; i < d._$_T.length; i++) {
                  if (Array.isArray(d._$_T[i]) && d._$_T[i][0] === 179) {
                    console.log(`★★★ base (pause ${pauses}): len=${d._$_T[i].length}`);
                    baseCaps.push(d._$_T[i]);
                    fs.writeFileSync('/tmp/nx_browser_base_cap3.json', JSON.stringify(d._$_T[i]));
                    if (d._$hr) fs.writeFileSync('/tmp/nx_browser_base_program_cap3.json', JSON.stringify(d._$hr, null, 1));
                    state = 'done';
                  }
                }
              }
            }
          } catch (e) {}
          break;
        }
      }
      if (pauses > 600) state = 'done';
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));
  console.log('[2] state:', state, 'pauses:', pauses, 'baseCaps:', baseCaps.length);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
