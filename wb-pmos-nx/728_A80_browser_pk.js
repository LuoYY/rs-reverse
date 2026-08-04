/**
 * 728_A80_browser_pk.js
 * 浏览器权威：采集闭包里所有数字数组池（_\$pk/_\$k0/_\$pI/_\$jo 等）完整内容
 * 目标是找到沙箱 _\$pk（410 元素数字字符串池）的浏览器对应物
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
        const out = { basearr: arr, numPools: {} };
        // 从所有帧闭包找数字数组（值全为数字的数组）
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
                      expression: `Array.isArray(${p.name}) && ${p.name}.length > 50 && ${p.name}.every(function(x){return typeof x === 'number' || typeof x === 'string';}) ? JSON.stringify({len:${p.name}.length, all:${p.name}.every(function(x){return typeof x==='number';}), head:${p.name}.slice(0,40)}) : 'no'`,
                      returnByValue: true,
                    });
                    const val = rr.result?.value;
                    if (val && val !== 'no' && val.startsWith('{')) {
                      out.numPools[p.name] = val;
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
        }
        fs.writeFileSync('/tmp/nx_browser_numpools.json', JSON.stringify(out, null, 1));
        console.log('数字池:', Object.keys(out.numPools).join(','));
        for (const [k, v] of Object.entries(out.numPools)) console.log(`${k}: ${v.substring(0, 250)}`);
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
