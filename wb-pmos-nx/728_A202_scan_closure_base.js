/**
 * 728_A202_scan_closure_base.js
 * 扫描所有闭包 scope 中的 179 开头数组（base）
 * 不做次数限制，覆盖整个 VM 执行期
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

  await cdp.send('Runtime.evaluate', { expression: 'window.__plain=null;window.__baseFound=null;window.__baseStack=null;' });
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
          state = 'collecting';
          console.log('★ 明文捕获，扫描闭包找 base');
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    if (state === 'collecting') {
      pauses++;
      const frames = params.callFrames || [];
      for (const f of frames) {
        for (let si = 0; si < (f.scopeChain || []).length; si++) {
          const scope = f.scopeChain[si];
          try {
            const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null);
            if (!props || !props.result) continue;
            for (const p of props.result) {
              if (!p.name || p.name.startsWith('__')) continue;
              if (p.value && p.value.type === 'object') {
                try {
                  const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                    callFrameId: f.callFrameId,
                    expression: `Array.isArray(${p.name}) && ${p.name}.length > 50 && ${p.name}[0] === 179 ? JSON.stringify(${p.name}) : 'no'`,
                    returnByValue: true,
                  });
                  const v = rr.result?.value;
                  if (v && v !== 'no') {
                    console.log(`★★★ base 找到 (pause ${pauses}, fn=${f.functionName}, var=${p.name}, scope=${scope.type}): len=${JSON.parse(v).length}`);
                    fs.writeFileSync('/tmp/nx_browser_base_cap4.json', v);
                    const st = await cdp.send('Runtime.evaluate', { expression: 'new Error().stack', returnByValue: true });
                    fs.writeFileSync('/tmp/nx_browser_base_stack4.json', JSON.stringify(st.result?.value));
                    state = 'done';
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        }
      }
      if (pauses > 400) state = 'done';
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
