/**
 * 728_A47_browser_597.js
 * 抓浏览器闭包里所有数组池（长度 100-700），寻找沙箱 _\$h7(597) 的对应物
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
        const out = { basearr: arr, pools: {} };
        // 从 _\$cS 帧（VM 解释器）闭包作用域找所有数组池
        for (let fi = 0; fi < Math.min(frames.length, 3); fi++) {
          const f = frames[fi];
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
                      expression: `Array.isArray(${p.name}) ? ${p.name}.length : -1`,
                      returnByValue: true,
                    });
                    const len = rr.result?.value;
                    if (typeof len === 'number' && len >= 100 && len <= 800) {
                      out.pools[p.name] = len;
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
        }
        fs.writeFileSync('/tmp/nx_browser_pools.json', JSON.stringify(out, null, 1));
        console.log('basearr len:', arr.length);
        console.log('数组池:', JSON.stringify(out.pools));
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
