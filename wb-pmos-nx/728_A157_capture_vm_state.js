/**
 * 728_A157_capture_vm_state.js
 * 捕获明文 basearr 构造时刻内层 VM 状态（bytecode + 寄存器），反编译起点
 * 复用 A139 方法 + evaluateOnCallFrame 读取 _\$cS 帧变量
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

  // 捕获明文 basearr（113 开头 160-190）断点 → 读取帧状态
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = '(this.length >= 150 && this.length <= 195 && typeof this[0] === "number" && this[0] === 113) ? (window.__cap = Array.from(this), true) : false';
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: pushR.result.objectId, condition: cond });

  let done = false;
  const handler = async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__cap ? JSON.stringify(window.__cap.length) : "0"', returnByValue: true });
    if (r.result?.value && +r.result.value >= 150) {
      done = true;
      cdp.off('Debugger.paused', handler);
      const frames = params.callFrames || [];
      console.log('调用帧:', frames.slice(0, 5).map(f => `${f.functionName || '(anon)'}@${f.location.lineNumber}:${f.location.columnNumber}`).join(' <- '));
      // 从 _\$cS 帧读取 VM 变量（bytecode、寄存器）
      const out = { frames: [] };
      for (let fi = 0; fi < Math.min(frames.length, 4); fi++) {
        const f = frames[fi];
        const frameInfo = { fn: f.functionName || '(anon)', scope: {} };
        const scope0 = f.scopeChain && f.scopeChain[0];
        if (scope0 && scope0.object && scope0.object.objectId) {
          const props = await cdp.send('Runtime.getProperties', { objectId: scope0.object.objectId, ownProperties: true }).catch(() => null);
          if (props && props.result) {
            for (const p of props.result) {
              if (!p.name) continue;
              try {
                const rr = await cdp.send('Debugger.evaluateOnCallFrame', {
                  callFrameId: f.callFrameId,
                  expression: `Array.isArray(${p.name}) ? 'arr/' + ${p.name}.length + ':' + JSON.stringify(${p.name}.slice(0, 20)) : (typeof ${p.name} === 'object' && ${p.name} !== null ? 'obj/' + Object.keys(${p.name}).length : typeof ${p.name} + ':' + String(${p.name}).substring(0, 40))`,
                  returnByValue: true,
                });
                const v = rr.result?.value;
                if (typeof v === 'string' && v.startsWith('arr/')) {
                  const [len, content] = v.slice(4).split(':', 2);
                  if (+len >= 100 || +len <= 30) frameInfo.scope[p.name] = `arr/${len}:${(content || '').substring(0, 200)}`;
                } else if (typeof v === 'string') {
                  frameInfo.scope[p.name] = v.substring(0, 100);
                }
              } catch (e) {}
            }
          }
        }
        out.frames.push(frameInfo);
      }
      fs.writeFileSync('/tmp/nx_browser_vmstate.json', JSON.stringify(out, null, 1));
      console.log('已保存 /tmp/nx_browser_vmstate.json');
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  if (!done) console.log('[2] 未捕获到断点');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
