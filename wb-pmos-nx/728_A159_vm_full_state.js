/**
 * 728_A159_vm_full_state.js
 * 捕获明文 basearr 构造时刻 _\$cS 帧的完整 VM 状态（bytecode 全量 + 寄存器）
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
      const out = { plainLen: +r.result.value, frames: [] };
      for (let fi = 0; fi < Math.min(frames.length, 3); fi++) {
        const f = frames[fi];
        const frameInfo = { fn: f.functionName || '(anon)', pos: `${f.location.lineNumber}:${f.location.columnNumber}`, vars: {} };
        const scope0 = f.scopeChain && f.scopeChain[0];
        if (scope0 && scope0.object && scope0.object.objectId) {
          const props = await cdp.send('Runtime.getProperties', { objectId: scope0.object.objectId, ownProperties: true }).catch(() => null);
          if (props && props.result) {
            for (const p of props.result) {
              if (!p.name || p.name.startsWith('_$gx')) continue;
              try {
                const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                  callFrameId: f.callFrameId,
                  expression: `Array.isArray(${p.name}) ? 'arr/' + ${p.name}.length + ':' + JSON.stringify(${p.name}) : (typeof ${p.name} === 'object' && ${p.name} !== null ? 'obj/' + JSON.stringify(Object.keys(${p.name})) : typeof ${p.name} + ':' + String(${p.name}).substring(0, 60))`,
                  returnByValue: true,
                });
                const v = rr.result?.value;
                if (typeof v === 'string' && (v.startsWith('arr/') || v.startsWith('obj/'))) {
                  frameInfo.vars[p.name] = v.substring(0, 500);
                }
              } catch (e) {}
            }
          }
        }
        out.frames.push(frameInfo);
      }
      fs.writeFileSync('/tmp/nx_browser_vmstate2.json', JSON.stringify(out, null, 1));
      console.log('已保存 /tmp/nx_browser_vmstate2.json');
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
