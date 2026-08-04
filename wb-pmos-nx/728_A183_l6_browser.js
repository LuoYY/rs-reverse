/**
 * 728_A183_l6_browser.js
 * 浏览器权威：捕获 _\$l6 等外层 dispatcher 寄存器的值（在报错点 audio 前）
 * 用 CDP 断点 opcode 274（_\$lf[17]=_\$l6[_\$eF[73]]）——但沙箱报错位置，浏览器不报错
 * 改用：在明文 basearr push 断点，从外层 dispatcher 帧读 _\$l6 值
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
        const frames = params.callFrames || [];
        // 从各帧读 _\$l6/_\$gy/_\$ga 等（外层 dispatcher 变量）
        const out = {};
        for (let fi = 0; fi < Math.min(frames.length, 6); fi++) {
          const f = frames[fi];
          const scope0 = f.scopeChain && f.scopeChain[0];
          if (!scope0 || !scope0.object || !scope0.object.objectId) continue;
          const props = await cdp.send('Runtime.getProperties', { objectId: scope0.object.objectId, ownProperties: true }).catch(() => null);
          if (props && props.result) {
            const names = props.result.map(p => p.name).filter(n => ['_$l6', '_$gy', '_$ga', '_$j_', '_$ib', '_$mQ', '_$kU', '_$od', '_$nF', '_$lf', '_$bi', '_$oX', '_$jc', '_$eF'].includes(n));
            if (names.length) {
              out[`帧${fi}_${f.functionName}`] = {};
              for (const n of names) {
                try {
                  const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                    callFrameId: f.callFrameId,
                    expression: `typeof ${n} !== 'undefined' ? (Array.isArray(${n}) ? 'arr/' + ${n}.length + ':' + JSON.stringify(${n}.slice(0, 10)) : (typeof ${n} === 'object' && ${n} !== null ? 'obj/' + Object.keys(${n}).length : typeof ${n} + ':' + String(${n}).substring(0, 50))) : 'undef'`,
                    returnByValue: true,
                  });
                  out[`帧${fi}_${f.functionName}`][n] = rr.result?.value;
                } catch (e) {}
              }
            }
          }
        }
        console.log(JSON.stringify(out, null, 1));
        fs.writeFileSync('/tmp/nx_browser_l6.json', JSON.stringify(out, null, 1));
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
