/**
 * 728_A175_cS_collect_v4.js
 * v4：_\$cS 断点收集，Node 侧数组存储（不走 window），每次 evaluateOnCallFrame 直接返回
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

  await cdp.send('Runtime.evaluate', { expression: 'window.__plain=null;' });

  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let phase = 'waiting';
  let cSCalls = 0;
  const collected = []; // Node 侧存储

  const handler = async (params) => {
    if (phase === 'waiting') {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          phase = 'collecting';
          console.log('★ 明文捕获，设 _\$cS 断点');
          const frames = params.callFrames || [];
          for (const f of frames) {
            if (f.functionName === '_$cS') {
              try {
                const objR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: '_$cS', returnByValue: false });
                if (objR.result?.objectId) {
                  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: objR.result.objectId });
                  console.log('✓ _\$cS 断点已设置');
                }
              } catch (e) { console.log('设断点失败:', e.message.substring(0, 60)); }
              break;
            }
          }
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    if (phase === 'collecting') {
      cSCalls++;
      try {
        const frames = params.callFrames || [];
        const f0 = frames[0];
        const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f0.callFrameId,
          expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length, jRLen:(p._$jR||[]).length}; })) : 'nohr'`,
          returnByValue: true,
        });
        const v = hr.result?.value;
        if (v && v !== 'nohr') {
          collected.push({ count: cSCalls, hr: JSON.parse(v) });
        }
      } catch (e) {}
      if (cSCalls >= 150) phase = 'done';
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成. cSCalls:', cSCalls, 'collected:', collected.length);
  const rp = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? JSON.stringify(window.__plain) : "null"', returnByValue: true });
  fs.writeFileSync('/tmp/nx_browser_cS_v4.json', JSON.stringify({ plain: JSON.parse(rp.result?.value || 'null'), collected }, null, 1));
  console.log('plain len:', JSON.parse(rp.result?.value || 'null').length);
  const big = collected.filter(x => (x.hr || []).some(p => p && p.gS && p.gS.length > 50));
  console.log('gS>50 记录:', big.length);
  for (const b of big.slice(0, 15)) {
    const gs = (b.hr || []).filter(p => p && p.gS).map(p => 'gS' + p.gS.length);
    console.log('  #' + b.count, gs.join(','));
  }
  const lens = new Set();
  for (const x of collected) for (const p of (x.hr || [])) if (p && p.gS) lens.add(p.gS.length);
  console.log('所有 gS 长度:', [...lens].sort((a, b) => a - b).join(','));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
