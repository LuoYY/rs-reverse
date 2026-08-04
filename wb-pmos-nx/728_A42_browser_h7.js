/**
 * 728_A42_browser_h7.js
 * 浏览器权威对照（分析用）：固定环境（reqable + nx-mock, nsd=67402）
 * 在 basearr push 断点时，evaluateOnCallFrame 读取调用帧的 _\$h7 / _\$pk / 环境池
 * 对比沙箱 _\$h7（597 元素表）
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

  // 条件断点：捕获 basearr + 记录帧
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
        console.log('basearr len:', arr.length);
        console.log('basearr[0-31]:', arr.slice(0, 32).join(','));
        console.log('basearr[25-28]:', arr.slice(25, 29).join(','));
        // 从调用帧读取局部变量
        const frames = params.callFrames || [];
        console.log('调用栈:', frames.slice(0, 6).map(f => `${f.functionName || '(anon)'}@${f.location.lineNumber}:${f.location.columnNumber}`).join(' <- '));
        const captures = {};
        // 尝试从多个帧读取 _\$h7 / _\$pk / _\$eF 等
        for (let fi = 0; fi < Math.min(frames.length, 8); fi++) {
          const frameId = frames[fi].callFrameId;
          for (const v of ['_$h7', '_$pk', '_$eF', '_$c_', '_$$a']) {
            try {
              const rr = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: frameId, expression: `typeof ${v} !== 'undefined' ? JSON.stringify((()=>{try{return Array.isArray(${v})?${v}.slice(0,400):(typeof ${v}==='object'?Object.keys(${v}).slice(0,50):'nonobj')}catch(e){return 'err:'+e.message}})()) : 'undef'`, returnByValue: true });
              const val = rr.result?.value;
              if (val && val !== 'undef' && val !== 'null' && !val.startsWith('err')) {
                captures[`f${fi}_${v}`] = val;
                if (val.length > 50) {
                  console.log(`帧${fi} ${v}:`, val.substring(0, 200));
                }
              }
            } catch (e) {}
          }
        }
        fs.writeFileSync('/tmp/nx_browser_captures.json', JSON.stringify({ basearr: arr, captures, stack: (params.callFrames || []).map(f => f.functionName || '(anon)') }, null, 1));
        console.log('\n已保存 /tmp/nx_browser_captures.json');
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] 加载固定环境页面...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 35000));
  await new Promise(r => setTimeout(r, 8000));
  console.log('[2] 完成');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
