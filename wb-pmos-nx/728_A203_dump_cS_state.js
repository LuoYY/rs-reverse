/**
 * 728_A203_dump_cS_state.js
 * 明文 push 时刻 dump _\$cS 闭包所有数组（含 base 若已在）
 * 用 setBreakpointOnFunctionCall + 断点内读闭包
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
        console.log('★ 明文捕获，dump _\$cS 闭包数组');
        const frames = params.callFrames || [];
        const out = { frames: [] };
        for (const f of frames) {
          const finfo = { fn: f.functionName || '(anon)', scopes: [] };
          for (let si = 0; si < (f.scopeChain || []).length; si++) {
            const scope = f.scopeChain[si];
            const sinfo = { type: scope.type, arrs: {} };
            try {
              const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null);
              if (props && props.result) {
                for (const p of props.result) {
                  if (!p.name || p.name.startsWith('__')) continue;
                  if (p.value && p.value.type === 'object') {
                    try {
                      const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                        callFrameId: f.callFrameId,
                        expression: `Array.isArray(${p.name}) ? ${p.name}.length + ':' + JSON.stringify(${p.name}.slice(0, 20)) : 'no'`,
                        returnByValue: true,
                      });
                      const v = rr.result?.value;
                      if (v && v !== 'no') sinfo.arrs[p.name] = v;
                    } catch (e) {}
                  }
                }
              }
            } catch (e) {}
            finfo.scopes.push(sinfo);
          }
          out.frames.push(finfo);
        }
        fs.writeFileSync('/tmp/nx_browser_cS_state_dump.json', JSON.stringify(out, null, 1));
        console.log('已保存 /tmp/nx_browser_cS_state_dump.json');
        console.log('帧:', out.frames.map(f => f.fn).join(' <- '));
        // 检查是否有 179 开头数组
        for (const f of out.frames) for (const s of f.scopes) for (const [k, v] of Object.entries(s.arrs)) {
          if (v.startsWith('159:') || v.includes(',179,') || v.includes('179,')) console.log(`  可能 base: ${f.fn} scope=${s.type} var=${k} ${v.substring(0, 100)}`);
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
