/**
 * 728_A199_capture_base_gen.js
 * 捕获 base 生成时刻：在 P cookie 写入前（cookie 加密前）从闭包读取 base 数组 + VM 状态
 * 方法：hook document.cookie setter（cookie 加密发生在 set 前），在 set 时读取 VM 栈中的 base
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

  // 捕获明文（113）断点
  await cdp.send('Runtime.evaluate', { expression: 'window.__plain=null;window.__baseCaps=[];' });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let state = 'waiting';
  let pauses = 0;

  const handler = async (params) => {
    if (state === 'waiting') {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          state = 'trace';
          console.log('★ 明文捕获');
          // 之后每次 pause 都检查：_$ax / _$_T 等 VM 栈数组
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    if (state === 'trace') {
      pauses++;
      try {
        // 从帧读取 _$ax / _$_T / _$aq（VM 栈数组）
        const frames = params.callFrames || [];
        for (const f of frames.slice(0, 3)) {
          try {
            const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f.callFrameId,
              expression: `JSON.stringify((()=>{var out={};try{if(typeof _$ax!=='undefined')out._$ax=_$ax.slice(0,200);}catch(e){}try{if(typeof _$_T!=='undefined')out._$_T=_$_T.slice(0,200);}catch(e){}try{if(typeof _$aq!=='undefined')out._$aq=(Array.isArray(_$aq)?_$aq.slice(0,200):null);}catch(e){}return out;})())`,
              returnByValue: true,
            });
            const v = rr.result?.value;
            if (v && v !== '{"_$ax":null,"_$_T":null,"_$aq":null}') {
              const d = JSON.parse(v);
              // 检查是否有 179 开头数组（base）或 113（明文）
              const arrs = [d._$ax, d._$_T, d._$aq].filter(Boolean);
              for (const a of arrs) {
                if (Array.isArray(a) && a[0] === 179) {
                  console.log(`★★★ base 捕获 (pause ${pauses}): len=${a.length}`);
                  fs.writeFileSync('/tmp/nx_browser_base_cap.json', JSON.stringify(a));
                  // 读程序
                  const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
                    callFrameId: f.callFrameId,
                    expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length}; })) : 'nohr'`,
                    returnByValue: true,
                  });
                  fs.writeFileSync('/tmp/nx_browser_base_program_cap.json', hr.result?.value || 'null');
                  state = 'done';
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
      if (pauses > 300) state = 'done';
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  console.log('[2] state:', state, 'pauses:', pauses);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
