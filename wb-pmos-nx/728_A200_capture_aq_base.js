/**
 * 728_A200_capture_aq_base.js
 * hook _\$aq（VM 帧入口）函数断点：明文 push 后捕获 base（179）生成时刻的程序+栈
 * _\$aq 帧含 _\$hr（程序对象）和 _\$_T（VM 状态）
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
  let aqBreaks = false;
  let pauses = 0;

  const handler = async (params) => {
    if (state === 'waiting') {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          state = 'hooking';
          console.log('★ 明文捕获，设 _\$aq 断点');
          // 从当前帧链找 _\$aq 函数对象
          const frames = params.callFrames || [];
          for (const f of frames) {
            if (f.functionName === '_$aq') {
              try {
                const objR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: '_$aq', returnByValue: false });
                if (objR.result?.objectId) {
                  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: objR.result.objectId });
                  aqBreaks = true;
                  console.log('✓ _\$aq 断点已设置');
                }
              } catch (e) { console.log('设断点失败:', e.message.substring(0, 60)); }
              break;
            }
          }
          state = 'collecting';
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    if (state === 'collecting') {
      pauses++;
      try {
        const frames = params.callFrames || [];
        const f0 = frames[0];
        // 读 _\$_T 数组（VM 栈/寄存器数组）
        const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f0.callFrameId,
          expression: `JSON.stringify((()=>{var out={};try{if(typeof _$_T!=='undefined'&&Array.isArray(_$_T)){out._$_T=_$_T.slice(0,250);}}catch(e){}try{if(typeof _$hr!=='undefined'){out._$hr=_$hr.map(function(p){if(!p)return null;return {iH:p._$iH,gS:typeof p._$gS==='string'?Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}):null,myLen:(p._$my||[]).length};});}}catch(e){}return out;})())`,
          returnByValue: true,
        });
        const v = rr.result?.value;
        if (v) {
          const d = JSON.parse(v);
          // 检查 _\$_T 中是否有 179 开头数组
          const tt = d._$_T;
          if (Array.isArray(tt)) {
            for (let i = 0; i < tt.length; i++) {
              if (Array.isArray(tt[i]) && tt[i][0] === 179) {
                console.log(`★★★ base 捕获 (pause ${pauses}, _\$_T[${i}]): len=${tt[i].length}`);
                fs.writeFileSync('/tmp/nx_browser_base_cap2.json', JSON.stringify(tt[i]));
                if (d._$hr) fs.writeFileSync('/tmp/nx_browser_base_program_cap2.json', JSON.stringify(d._$hr, null, 1));
                state = 'done';
              }
            }
            // 记录非空数组
            if (tt.some(x => Array.isArray(x) && x.length > 100) && pauses % 20 === 0) {
              const heads = tt.map(x => Array.isArray(x) ? x[0] : typeof x).join(',');
              console.log(`_\$T (pause ${pauses}): [${heads}]`);
            }
          }
        }
      } catch (e) {}
      if (pauses > 500) state = 'done';
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));
  console.log('[2] state:', state, 'pauses:', pauses);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
