/**
 * 728_A84_browser_lf.js
 * 浏览器权威：basearr push 时，从 _\$cS 帧闭包找 _\$lf 对应物（数组，len ~196 或更大）
 * 关键：理解 _\$lf 在浏览器中如何初始化
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

  // 在两个断点采集：basearr push 时刻的 _\$cS 帧全部变量 + 它们的初始类型
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
        const out = { basearr: arr, frames: [] };
        for (let fi = 0; fi < Math.min(frames.length, 3); fi++) {
          const f = frames[fi];
          const frameInfo = { fn: f.functionName || '(anon)', pos: `${f.location.lineNumber}:${f.location.columnNumber}`, scope0Vars: {} };
          const scope0 = f.scopeChain && f.scopeChain[0];
          if (scope0 && scope0.object && scope0.object.objectId) {
            try {
              const props = await cdp.send('Runtime.getProperties', { objectId: scope0.object.objectId, ownProperties: true }).catch(() => null);
              if (props && props.result) {
                for (const p of props.result) {
                  if (!p.name) continue;
                  const v = p.value;
                  let desc = '?';
                  if (v && v.type === 'object') {
                    try {
                      const rr = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: `Array.isArray(${p.name}) ? 'arr/' + ${p.name}.length : (typeof ${p.name} === 'object' ? 'obj/' + Object.keys(${p.name}).length : 'other')`, returnByValue: true });
                      desc = rr.result?.value;
                    } catch (e) { desc = 'obj'; }
                  } else if (v) desc = `${v.type}:${String(v.value !== undefined ? v.value : v.description).substring(0, 40)}`;
                  frameInfo.scope0Vars[p.name] = desc;
                }
              }
            } catch (e) {}
          }
          out.frames.push(frameInfo);
        }
        fs.writeFileSync('/tmp/nx_browser_lf.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_lf.json');
        for (const f of out.frames) {
          console.log(`== ${f.fn}@${f.pos}`);
          console.log(JSON.stringify(f.scope0Vars).substring(0, 1500));
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
