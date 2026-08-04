/**
 * 728_A166_hook_1_fn.js
 * 用 push 断点先确认明文，然后获取 _\$\$1 函数对象断点
 * 每次 _\$\$1 调用（basearr 构造）记录参数（目标数组 head）+ VM 程序
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';
const MOCK_DIR = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock';

(async () => {
  const raw = fs.readFileSync(path.join(MOCK_DIR, '412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
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

  await page.route('**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    try {
      if (pathname === '/') {
        await route.fulfill({ status: 412, contentType: 'text/html;charset=utf-8', body: rawBody });
        return;
      }
      const file = path.join(MOCK_DIR, pathname);
      if (fs.existsSync(file)) {
        await route.fulfill({ status: 200, contentType: pathname.endsWith('.js') ? 'application/javascript' : 'text/plain', body: fs.readFileSync(file, 'utf8') });
        return;
      }
    } catch (e) {}
    await route.continue().catch(() => {});
  });

  // push 断点：捕获明文（确认环境 + 获取 _\$\$1 函数）
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let hooked = false;
  const pushHandler = async (params) => {
    if (hooked) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      // 只在 push 断点（this 是数组）时处理
      const isPush = await cdp.send('Runtime.evaluate', { expression: 'Array.isArray(this) ? "yes" : "no"', returnByValue: true });
      if (isPush.result?.value !== 'yes') { await cdp.send('Debugger.resume').catch(() => {}); return; }
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
      if (r.result?.value === 'yes') {
        hooked = true;
        cdp.off('Debugger.paused', pushHandler);
        console.log('★ 明文捕获，获取 _\$\$1 函数断点');
        // 从帧获取 _\$\$1 函数对象
        const frames = params.callFrames || [];
        const f0 = frames[0];
        if (f0.functionName === '_$$1') {
          try {
            const objR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f0.callFrameId, expression: '_$$1', returnByValue: false });
            if (objR.result?.objectId) {
              await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: objR.result.objectId });
              console.log('✓ _\$\$1 断点已设置');
            }
          } catch (e) { console.log('设置失败:', e.message.substring(0, 60)); }
        }
        // 保存明文
        const rp = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__plain)', returnByValue: true });
        fs.writeFileSync('/tmp/nx_browser_plain_1.json', rp.result?.value || 'null');
        console.log('明文 len:', JSON.parse(rp.result?.value || 'null').length);
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', pushHandler);

  // _\$\$1 断点 handler
  const fnHandler = async (params) => {
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      // 读取 _\$\$1 的参数（_$aq=目标数组, _$_T=数据源）
      const v = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `JSON.stringify({aqHead:Array.isArray(_$aq)?_$aq.slice(0,8):typeof _$aq, aqLen:Array.isArray(_$aq)?_$aq.length:0, _THead:Array.isArray(_$_T)?_$_T.slice(0,8):typeof _$_T, _TLen:Array.isArray(_$_T)?_$_T.length:0})`,
        returnByValue: true,
      });
      const val = v.result?.value;
      if (val) {
        const d = JSON.parse(val);
        // 捕获 aq 是 179 开头的（base）
        if (Array.isArray(d.aqHead) && d.aqHead[0] === 179) {
          console.log('★★★ base 生成 _\$\$1 调用! aqLen:', d.aqLen, 'head:', d.aqHead.join(','));
          // 保存 VM 程序
          const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
            callFrameId: f0.callFrameId,
            expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length, jRLen:(p._$jR||[]).length}; })) : 'nohr'`,
            returnByValue: true,
          });
          const hv = hr.result?.value;
          if (hv && hv !== 'nohr') {
            fs.writeFileSync('/tmp/nx_browser_base_program.json', JSON.stringify(JSON.parse(hv), null, 1));
            console.log('★ base 程序已保存 /tmp/nx_browser_base_program.json');
          }
        }
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', fnHandler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));
  console.log('[2] 完成');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
