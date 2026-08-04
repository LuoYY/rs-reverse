/**
 * 728_A44_browser_pool.js
 * 在 basearr push 断点，从 _\$cS 帧读取所有局部变量（找 597 元素环境池）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';

(async () => {
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

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 138 && this.length <= 152 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__basearr) ? (window.__basearr = Array.from(this), true) : false',
  });

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__basearr)', returnByValue: true });
      const arr = JSON.parse(r.result?.value || '[]');
      if (arr.length >= 138) {
        done = true;
        cdp.off('Debugger.paused', handler);
        const frames = params.callFrames || [];
        const out = { basearr: arr, frameVars: [] };
        for (let fi = 0; fi < Math.min(frames.length, 5); fi++) {
          const f = frames[fi];
          const frameInfo = { fn: f.functionName || '(anon)', pos: `${f.location.lineNumber}:${f.location.columnNumber}`, vars: {} };
          // 从 _\$cS 帧读取所有变量（scope0 的局部变量）
          const scope0 = f.scopeChain && f.scopeChain[0];
          if (scope0 && scope0.object && scope0.object.objectId) {
            const props = await cdp.send('Runtime.getProperties', { objectId: scope0.object.objectId, ownProperties: true }).catch(() => null);
            if (props && props.result) {
              for (const p of props.result) {
                if (p.name && !p.name.startsWith('__')) {
                  const val = p.value && p.value.description !== undefined ? p.value.description : (p.value && p.value.value !== undefined ? String(p.value.value) : (p.value && p.value.type));
                  // 只记录数组/对象（长度/keys），避免超大
                  if (p.value && p.value.type === 'object') {
                    // 尝试拿 length
                    try {
                      const lenR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: `typeof ${p.name} === 'object' && ${p.name} !== null ? (Array.isArray(${p.name}) ? ${p.name}.length : Object.keys(${p.name}).length) : -1`, returnByValue: true });
                      const len = lenR.result?.value;
                      frameInfo.vars[p.name] = `obj/len=${len}`;
                    } catch (e) { frameInfo.vars[p.name] = 'obj'; }
                  } else if (p.value) {
                    frameInfo.vars[p.name] = `${p.value.type}:${String(val).substring(0, 60)}`;
                  }
                }
              }
            }
          }
          out.frameVars.push(frameInfo);
        }
        fs.writeFileSync('/tmp/nx_browser_pool.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_pool.json');
        for (const f of out.frameVars) {
          console.log(`== ${f.fn}@${f.pos}`);
          console.log(JSON.stringify(f.vars).substring(0, 2000));
        }
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
