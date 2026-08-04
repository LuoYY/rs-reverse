/**
 * 728_A174_cS_collect_v3.js
 * v3：_\$cS 函数断点收集，用页面 window.__cSLog 存储（避免 Node 侧 appendFile 问题）
 * 目标：捕获所有 basearr 相关 VM 程序（含 base 生成）
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

  // 初始化页面存储
  await cdp.send('Runtime.evaluate', { expression: 'window.__cSLog=[];window.__plain=null;window.__cSCount=0;' });

  // push 断点：捕获明文
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let phase = 'waiting';
  let cSCalls = 0;

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
          // 存到页面
          await cdp.send('Runtime.evaluate', {
            expression: `window.__cSLog.push(${JSON.stringify(JSON.stringify(v))}); window.__cSCount++; if(window.__cSCount % 20 === 0) console.log('cS', window.__cSCount);`,
            returnByValue: true,
          });
        }
      } catch (e) {}
      if (cSCalls >= 120) phase = 'done';
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成. cSCalls:', cSCalls, 'phase:', phase);
  // 导出
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({plain: window.__plain, count: window.__cSCount, log: window.__cSLog})', returnByValue: true });
    fs.writeFileSync('/tmp/nx_browser_cS_v3.json', r.result?.value || 'null');
    const d = JSON.parse(r.result?.value || 'null');
    console.log('plain len:', d.plain ? d.plain.length : 0, 'count:', d.count);
    const parsed = d.log.map(l => JSON.parse(l));
    const big = parsed.filter(x => (x || []).some(p => p && p.gS && p.gS.length > 50));
    console.log('gS>50 记录:', big.length);
    for (const b of big.slice(0, 10)) {
      const gs = (b || []).filter(p => p && p.gS).map(p => 'gS' + p.gS.length);
      console.log('  ', gs.join(','));
    }
    const lens = new Set();
    for (const x of parsed) for (const p of (x || [])) if (p && p.gS) lens.add(p.gS.length);
    console.log('所有 gS 长度:', [...lens].sort((a, b) => a - b).join(','));
    console.log('已保存 /tmp/nx_browser_cS_v3.json');
  } catch (e) { console.log('导出失败:', e.message.substring(0, 80)); }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
