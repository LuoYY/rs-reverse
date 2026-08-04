/**
 * 728_A160_capture_gS.js
 * 捕获内层 VM 完整 bytecode（_\$gS 字符串）+ basearr 明文完整数组
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

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 150 && this.length <= 195 && typeof this[0] === "number" && this[0] === 113) ? (window.__cap = Array.from(this), true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__cap ? JSON.stringify(window.__cap.length) : "0"', returnByValue: true });
    if (r.result?.value && +r.result.value >= 150) {
      done = true;
      cdp.off('Debugger.paused', handler);
      const frames = params.callFrames || [];
      const out = { plain: null, programs: [] };
      // 明文完整
      try {
        const rr = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap)', returnByValue: true });
        out.plain = JSON.parse(rr.result?.value || 'null');
      } catch (e) {}
      // 从 _\$aq 帧读 _\$hr（VM 程序对象，含 _\$gS bytecode）
      for (let fi = 0; fi < Math.min(frames.length, 4); fi++) {
        const f = frames[fi];
        try {
          const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
            callFrameId: f.callFrameId,
            expression: `typeof _$hr !== 'undefined' && Array.isArray(_$hr) ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : p._$gS, myLen:(p._$my||[]).length, jRLen:(p._$jR||[]).length}; })) : 'nohr'`,
            returnByValue: true,
          });
          const v = rr.result?.value;
          if (v && v !== 'nohr') {
            out.programs.push({ fn: f.functionName || '(anon)', hr: JSON.parse(v) });
          }
        } catch (e) {}
      }
      fs.writeFileSync('/tmp/nx_browser_programs.json', JSON.stringify(out, null, 1));
      console.log('plain len:', out.plain ? out.plain.length : 0);
      for (const p of out.programs) {
        console.log(p.fn, 'programs:', (p.hr || []).length);
        for (const h of (p.hr || [])) {
          if (h && h.gS) console.log('  gS len:', h.gS.length, 'head:', h.gS.slice(0, 40).join(','));
        }
      }
      console.log('已保存 /tmp/nx_browser_programs.json');
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
