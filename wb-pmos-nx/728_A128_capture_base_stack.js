/**
 * 728_A128_capture_base_stack.js
 * 浏览器权威：捕获 base（179 开头加密 basearr，len 155-175）构造调用栈
 * 定位 base 生成代码（反编译起点）
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

  // 条件断点：捕获 179 开头 len 155-175 的数组（base）+ 调用栈
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 155 && this.length <= 175 && this[0] === 179 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__capBase) ? (window.__capBase = Array.from(this), window.__capBaseStack = new Error().stack, true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__capBase ? JSON.stringify(window.__capBase) : "null"', returnByValue: true });
      const arr = JSON.parse(r.result?.value || 'null');
      if (arr && arr.length >= 155) {
        done = true;
        cdp.off('Debugger.paused', handler);
        console.log('base len:', arr.length);
        console.log('base[0-31]:', arr.slice(0, 32).join(','));
        console.log('base[22-40]:', arr.slice(22, 41).join(','));
        console.log('base[25-28]:', arr.slice(25, 29).join(','));
        console.log('base 尾 8:', arr.slice(-8).join(','));
        const st = await cdp.send('Runtime.evaluate', { expression: 'window.__capBaseStack', returnByValue: true });
        console.log('\n调用栈:\n' + (st.result?.value || '').split('\n').slice(0, 15).join('\n'));
        fs.writeFileSync('/tmp/nx_browser_base_stack.json', JSON.stringify({ base: arr, stack: st.result?.value }));
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] 加载固定环境页面...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  if (!done) console.log('[2] 未捕获 base（可能 179 数组不是 push 构造或条件不匹配）');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
