/**
 * 728_A165_hook_cS.js
 * hook _\$cS（内层 VM 解释器）：每次调用记录 _\$gx bytecode + _\$hr 程序
 * 捕获所有 basearr 相关程序（明文构造 + base 加密）
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

  // 先捕获明文 basearr 断点确认环境，然后 hook _\$cS
  // 用 push 断点存明文 → 触发后 hook _\$cS
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let captured = false;
  const handler = async (params) => {
    if (captured) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
      if (r.result?.value === 'yes') {
        captured = true;
        cdp.off('Debugger.paused', handler);
        console.log('★ 明文 basearr 捕获，开始 hook _\$cS...');
        // 保存明文
        const rp = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__plain)', returnByValue: true });
        fs.writeFileSync('/tmp/nx_browser_plain_cS.json', rp.result?.value || 'null');
        // 移除 push 断点
        await cdp.send('Debugger.removeBreakpoint', { breakpointId: null }).catch(() => {});
        // 找 _\$cS 函数对象并 hook
        // 从当前帧获取 _\$cS
        const frames = params.callFrames || [];
        for (const f of frames) {
          if (f.functionName === '_$cS') {
            // 用 evaluateOnCallFrame 获取函数并断点
            try {
              const objR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: '_$cS', returnByValue: false });
              const objId = objR.result?.objectId;
              if (objId) {
                await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: objId });
                console.log('已设置 _\$cS 断点');
              }
            } catch (e) {}
            break;
          }
        }
        // 记录当前程序
        try {
          const f0 = frames[0];
          const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
            callFrameId: f0.callFrameId,
            expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length}; })) : 'nohr'`,
            returnByValue: true,
          });
          const v = hr.result?.value;
          if (v && v !== 'nohr') {
            console.log('当前 _\$hr:', JSON.stringify(JSON.parse(v), null, 1).substring(0, 1000));
            fs.appendFileSync('/tmp/nx_browser_cS_programs.jsonl', JSON.stringify({ stage: 'plain', hr: JSON.parse(v) }) + '\n');
          }
        } catch (e) {}
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  // 捕获 _\$cS 断点
  let cSCount = 0;
  const cSHandler = async (params) => {
    cSCount++;
    if (cSCount > 200) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    try {
      const frames = params.callFrames || [];
      const f0 = frames[0];
      const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f0.callFrameId,
        expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length}; })) : 'nohr'`,
        returnByValue: true,
      });
      const v = hr.result?.value;
      if (v && v !== 'nohr') {
        const arr = JSON.parse(v);
        const gsLens = (arr || []).filter(x => x && x.gS).map(x => x.gS.length).join(',');
        fs.appendFileSync('/tmp/nx_browser_cS_programs.jsonl', JSON.stringify({ count: cSCount, hr: arr }) + '\n');
        if (cSCount % 20 === 0) console.log('_\$cS 调用', cSCount, 'gS lens:', gsLens);
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', cSHandler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 45000));
  console.log('[2] _\$cS 调用总数:', cSCount);
  // 检查是否捕获了 base 相关程序（gS 长度大的）
  try {
    const lines = fs.readFileSync('/tmp/nx_browser_cS_programs.jsonl', 'utf8').split('\n').filter(Boolean);
    const all = lines.map(l => JSON.parse(l));
    const big = all.filter(x => (x.hr || []).some(p => p && p.gS && p.gS.length > 100));
    console.log('gS > 100 的记录:', big.length);
    for (const b of big.slice(0, 5)) {
      console.log('  count', b.count, (b.hr || []).filter(p => p && p.gS).map(p => `gS${p.gS.length}`).join(','));
    }
  } catch (e) {}
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
