/**
 * 728_A176_hook_1_v2.js
 * hook _\$\$1（basearr 构造函数）函数断点：每次调用记录目标数组 head（113 明文 / 179 base）
 * 捕获 base 生成调用
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

  await cdp.send('Runtime.evaluate', { expression: 'window.__plain=null;window.__b1Log=[];' });

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let phase = 'waiting';
  let calls = 0;
  const collected = [];

  const handler = async (params) => {
    if (phase === 'waiting') {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          phase = 'collecting';
          console.log('★ 明文捕获，设 _\$\$1 断点');
          const frames = params.callFrames || [];
          const f0 = frames[0];
          if (f0.functionName === '_$$1') {
            try {
              const objR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f0.callFrameId, expression: '_$$1', returnByValue: false });
              if (objR.result?.objectId) {
                await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: objR.result.objectId });
                console.log('✓ _\$\$1 断点已设置');
              }
            } catch (e) { console.log('设断点失败:', e.message.substring(0, 60)); }
          }
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    if (phase === 'collecting') {
      calls++;
      try {
        const frames = params.callFrames || [];
        const f0 = frames[0];
        const v = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f0.callFrameId,
          expression: `JSON.stringify({aqHead:Array.isArray(_$aq)?_$aq.slice(0,10):typeof _$aq, aqLen:Array.isArray(_$aq)?_$aq.length:0, _THead:Array.isArray(_$_T)?_$_T.slice(0,10):typeof _$_T, _TLen:Array.isArray(_$_T)?_$_T.length:0})`,
          returnByValue: true,
        });
        const val = v.result?.value;
        if (val) {
          const d = JSON.parse(val);
          collected.push({ call: calls, ...d });
          // 179 开头 = base！
          if (Array.isArray(d.aqHead) && d.aqHead[0] === 179) {
            console.log(`★★★ base 调用 #${calls}: aqLen=${d.aqLen} head=${d.aqHead.join(',')}`);
            // 保存 VM 程序
            const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
              callFrameId: f0.callFrameId,
              expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length, jRLen:(p._$jR||[]).length}; })) : 'nohr'`,
              returnByValue: true,
            });
            const hv = hr.result?.value;
            if (hv && hv !== 'nohr') {
              fs.writeFileSync('/tmp/nx_browser_base_program2.json', JSON.stringify(JSON.parse(hv), null, 1));
              console.log('★ base 程序已保存');
            }
          } else if (Array.isArray(d.aqHead) && d.aqHead[0] === 113) {
            console.log(`明文调用 #${calls}: aqLen=${d.aqLen}`);
          }
        }
      } catch (e) {}
      if (calls >= 60) phase = 'done';
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成. calls:', calls, 'phase:', phase);
  const rp = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? JSON.stringify(window.__plain) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_1_v2.json', JSON.stringify({ plain: JSON.parse(rp.result?.value || 'null'), collected }, null, 1));
  console.log('明文 len:', JSON.parse(rp.result?.value || 'null').length);
  console.log('collected 记录:', collected.length);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
