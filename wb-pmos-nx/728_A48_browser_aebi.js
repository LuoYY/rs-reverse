/**
 * 728_A48_browser_aebi.js
 * 浏览器权威：抓 $_ts.aebi 各组长度和内容，与沙箱对比
 * 同时抓 basearr push 时刻的完整调用栈 + 相关池内容
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
        for (let fi = 0; fi < Math.min(frames.length, 4); fi++) {
          const f = frames[fi];
          const frameInfo = { fn: f.functionName || '(anon)', pos: `${f.location.lineNumber}:${f.location.columnNumber}`, closurePools: {} };
          for (const scope of (f.scopeChain || [])) {
            if (scope.type !== 'closure') continue;
            try {
              const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null);
              if (props && props.result) {
                for (const p of props.result) {
                  if (!p.name || p.name.startsWith('__')) continue;
                  try {
                    const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                      callFrameId: f.callFrameId,
                      expression: `Array.isArray(${p.name}) ? 'arr/' + ${p.name}.length : (typeof ${p.name} === 'object' && ${p.name} !== null ? 'obj/' + Object.keys(${p.name}).length : 'other')`,
                      returnByValue: true,
                    });
                    const desc = rr.result?.value;
                    if (typeof desc === 'string' && (desc.startsWith('arr/') || desc.startsWith('obj/'))) {
                      frameInfo.closurePools[p.name] = desc;
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
          out.frames.push(frameInfo);
        }
        // 抓 $_ts
        try {
          const ts = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify((()=>{const t=$_ts||{};return {nsd:t.nsd, aebiLens:(t.aebi||[]).map(a=>Array.isArray(a)?a.length:typeof a), scjKeys:Object.keys(t.scj||{}).slice(0,30)}})())`, returnByValue: true });
          out.tsInfo = ts.result?.value;
        } catch (e) {}
        fs.writeFileSync('/tmp/nx_browser_aebi.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_aebi.json');
        console.log('tsInfo:', out.tsInfo);
        for (const f of out.frames) {
          console.log(`== ${f.fn}@${f.pos}`);
          console.log('  pools:', JSON.stringify(f.closurePools).substring(0, 800));
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
