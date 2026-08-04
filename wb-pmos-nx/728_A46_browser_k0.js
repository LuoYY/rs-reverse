/**
 * 728_A46_browser_k0.js
 * 抓浏览器闭包 _\$k0（423 元素池）完整内容，与沙箱 _\$pk 对比
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
        const out = { basearr: arr };
        // 从 _\$cS 帧的 closure scope 里抓 _\$k0 完整内容
        for (let fi = 0; fi < Math.min(frames.length, 3); fi++) {
          const f = frames[fi];
          for (const scope of (f.scopeChain || [])) {
            try {
              const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null);
              if (props && props.result) {
                for (const p of props.result) {
                  if (p.name === '_$k0' || p.name === '_$pk' || p.name === '_$jo') {
                    const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                      callFrameId: f.callFrameId,
                      expression: `JSON.stringify(Array.isArray(${p.name}) ? ${p.name} : 'notarr')`,
                      returnByValue: true,
                    });
                    out[p.name] = rr.result?.value;
                    console.log(`${p.name} len:`, JSON.parse(rr.result?.value || '[]').length);
                  }
                }
              }
            } catch (e) {}
          }
        }
        fs.writeFileSync('/tmp/nx_browser_k0.json', JSON.stringify(out));
        console.log('保存 /tmp/nx_browser_k0.json');
        console.log('k0 前 100:', JSON.stringify(JSON.parse(out._$k0 || '[]').slice(0, 100)).substring(0, 600));
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
