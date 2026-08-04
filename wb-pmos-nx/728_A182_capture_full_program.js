/**
 * 728_A182_capture_full_program.js
 * 完整捕获 VM 程序对象（所有字段含表：_\$gS/_\$my/_\$jR/_\$iH/_\$fL/_\$iK/_\$dx 等）
 * 为 Node VM 模拟器提供完整输入
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

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
      if (r.result?.value === 'yes') {
        done = true;
        cdp.off('Debugger.paused', handler);
        console.log('★ 明文捕获，读取完整程序对象');
        const frames = params.callFrames || [];
        // 从 _\$aq 帧读 _\$hr（程序对象数组，完整字段）
        for (let fi = 0; fi < Math.min(frames.length, 4); fi++) {
          const f = frames[fi];
          try {
            const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f.callFrameId,
              expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; var out={}; try{out._$gS=typeof p._$gS==='string'?Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}):null;}catch(e){} try{out._$my=(p._$my||[]).length;}catch(e){} try{out._$jR=(p._$jR||[]).length;}catch(e){} try{out._$iH=p._$iH;}catch(e){} try{out._$fL=p._$fL;}catch(e){} try{out._$fB=p._$fB;}catch(e){} try{out._$j5=p._$j5;}catch(e){} try{out._$as=p._$as;}catch(e){} try{out._$db=p._$db;}catch(e){} try{out._$g9=p._$g9;}catch(e){} try{out._$_0=p._$_0;}catch(e){} return out; })) : 'nohr'`,
              returnByValue: true,
            });
            const v = rr.result?.value;
            if (v && v !== 'nohr') {
              console.log(`帧${fi} (${f.functionName}): ${v.substring(0, 500)}`);
              fs.writeFileSync('/tmp/nx_browser_program_full.json', v);
            }
          } catch (e) {}
        }
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
