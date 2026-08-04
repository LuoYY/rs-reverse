/**
 * 728_A185_outer_flow_browser.js
 * 浏览器权威：捕获外层 dispatcher（_\$s[0]）执行的 opcode 序列（_\$jc 变化）
 * 对比沙箱死循环，找出 _\$ib 差异导致的跳转差异
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

  // 捕获明文（113）断点，此时外层 dispatcher 应已执行过
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
        console.log('★ 明文捕获');
        // 读外层 dispatcher 关键变量的值（从闭包 scope 链）
        const frames = params.callFrames || [];
        const out = {};
        for (let fi = 0; fi < Math.min(frames.length, 5); fi++) {
          const f = frames[fi];
          for (let si = 0; si < (f.scopeChain || []).length; si++) {
            const scope = f.scopeChain[si];
            if (scope.type !== 'closure') continue;
            try {
              const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null);
              if (!props || !props.result) continue;
              for (const p of props.result) {
                if (!p.name) continue;
                // 只记录关键变量
                if (/^_\$(gy|ga|j_|iG|mt|jQ|ib|l6|lf|bi|oX|jc|eF|kd|nL|oV|bu|dn|iQ|l5)$/.test(p.name)) {
                  try {
                    const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                      callFrameId: f.callFrameId,
                      expression: `typeof ${p.name} !== 'undefined' ? (Array.isArray(${p.name}) ? 'arr/' + ${p.name}.length + ':' + JSON.stringify(${p.name}.slice(0, 15)) : (typeof ${p.name} === 'object' && ${p.name} !== null ? 'obj/' + Object.keys(${p.name}).length : typeof ${p.name} + ':' + String(${p.name}).substring(0, 40))) : 'undef'`,
                      returnByValue: true,
                    });
                    if (rr.result?.value) out[p.name] = rr.result.value;
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
        }
        console.log('外层 dispatcher 变量:', JSON.stringify(out, null, 1));
        fs.writeFileSync('/tmp/nx_browser_outer_vars.json', JSON.stringify(out, null, 1));
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
