/**
 * 728_A43_browser_vars.js
 * 在 basearr push 断点，枚举调用帧的所有局部变量名（用 Debugger.getScope? 或 evaluate Object.keys）
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
        const out = { basearr: arr, frames: [] };
        for (let fi = 0; fi < Math.min(frames.length, 6); fi++) {
          const f = frames[fi];
          // 枚举帧内变量：尝试用 Object.keys 不行，改用 Debugger.evaluateOnCallFrame 里的 Object.getOwnPropertyNames on scope
          // 实际可用方式：直接读取常见混淆变量名
          const frameInfo = { fn: f.functionName || '(anon)', pos: `${f.location.lineNumber}:${f.location.columnNumber}` };
          // 从帧读取所有 scope 变量
          try {
            const scopes = await cdp.send('Debugger.getScopeDetails', { callFrameId: f.callFrameId }).catch(() => null);
            if (scopes) frameInfo.scopeNames = scopes.scopeDetails;
          } catch (e) {}
          // 尝试用 evaluateOnCallFrame 读取: 变量列表 from Object.keys of this
          try {
            const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f.callFrameId,
              expression: `JSON.stringify(Object.keys(this).slice(0,60))`,
              returnByValue: true,
            });
            frameInfo.thisKeys = rr.result?.value;
          } catch (e) {}
          // 用 Runtime.getProperties 读取 scope chain
          try {
            const props = await cdp.send('Runtime.getProperties', { objectId: f.scopeChain && f.scopeChain[0] && f.scopeChain[0].object && f.scopeChain[0].object.objectId, ownProperties: true }).catch(() => null);
            if (props && props.result) frameInfo.scope0Props = props.result.slice(0, 50).map(p => p.name);
          } catch (e) {}
          out.frames.push(frameInfo);
        }
        fs.writeFileSync('/tmp/nx_browser_frames.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_frames.json');
        console.log('frames:', JSON.stringify(out.frames.map(f => `${f.fn}@${f.pos}`)));
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
