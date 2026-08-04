process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await cdp.send('Runtime.evaluate', { expression: 'window.__cnt=0;' });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  let aqObjectId = null;
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 100 && this.length <= 300 && typeof this[0] === "number" && this[0] === 113 && window.__cnt < 8) ? (window.__cnt++, true) : false',
  });
  const pushHandler = async (params) => {
    try {
      const { callFrames } = params;
      const stack = callFrames.map(f => f.functionName + '@' + f.location.lineNumber).join(' <- ');
      console.log('push 113 | ' + stack.substring(0, 180));
      for (const f of callFrames) {
        if (['_$aq', '_$$1', '_$cS'].includes(f.functionName) && !aqObjectId) {
          const fo = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: f.functionName });
          if (fo.result && fo.result.result && fo.result.result.objectId) { aqObjectId = fo.result.result.objectId; console.log('获取函数对象:', f.functionName); }
        }
      }
    } catch (e) {}
    await cdp.send('Debugger.resume', {});
  };
  cdp.on('Debugger.paused', pushHandler);
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 25000));
  console.log('aqObjectId:', aqObjectId ? 'yes' : 'no');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
