/**
 * 728_A173_fn_breakpoint_v2.js
 * v2：先用 push 断点捕获明文 + 获取 _\$cS 函数对象 → 移除 push 断点 → 设 _\$cS 函数断点
 * 独立 handler + 严格标志，捕获 base 生成程序
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

  // push 断点：捕获明文（113）
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && typeof this[0] === "number" && this[0] === 113 && !window.__plain) ? (window.__plain = Array.from(this), true) : false',
  });

  let phase = 'waiting';
  let cSBreakpointSet = false;
  let cSCalls = 0;

  const handler = async (params) => {
    // 阶段 1：等明文
    if (phase === 'waiting') {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'window.__plain ? "yes" : "no"', returnByValue: true });
        if (r.result?.value === 'yes') {
          phase = 'hooking';
          console.log('★ 明文捕获');
          // 获取 _\$cS 函数对象（从当前帧链）
          const frames = params.callFrames || [];
          for (const f of frames) {
            if (f.functionName === '_$cS') {
              try {
                const objR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: '_$cS', returnByValue: false });
                if (objR.result?.objectId) {
                  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: objR.result.objectId });
                  cSBreakpointSet = true;
                  console.log('✓ _\$cS 函数断点已设置');
                  // 保存明文 + 当前 VM 程序
                  const rp = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__plain)', returnByValue: true });
                  fs.writeFileSync('/tmp/nx_browser_plain_v2.json', rp.result?.value || 'null');
                }
              } catch (e) { console.log('设断点失败:', e.message.substring(0, 80)); }
              break;
            }
          }
          phase = 'collecting';
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    // 阶段 2：_\$cS 断点收集
    if (phase === 'collecting') {
      cSCalls++;
      try {
        const frames = params.callFrames || [];
        const f0 = frames[0];
        // 读取 _\$hr（程序对象）
        const hr = await cdp.send('Debugger.evaluateOnCallFrame', {
          callFrameId: f0.callFrameId,
          expression: `typeof _$hr !== 'undefined' ? JSON.stringify(_$hr.map(function(p){ if(!p) return null; return {iH:p._$iH, fL:p._$fL, gS:typeof p._$gS === 'string' ? Array.from(p._$gS).map(function(c){return c.charCodeAt(0);}) : null, myLen:(p._$my||[]).length, jRLen:(p._$jR||[]).length}; })) : 'nohr'`,
          returnByValue: true,
        });
        const v = hr.result?.value;
        if (v && v !== 'nohr') {
          const arr = JSON.parse(v);
          const gs = (arr || []).filter(x => x && x.gS);
          // 记录所有不同长度的程序
          const key = gs.map(g => g.gS.length).join(',');
          if (!global.__seen || !global.__seen[key]) {
            global.__seen = global.__seen || {};
            global.__seen[key] = true;
            console.log(`_\$cS 调用#${cSCalls}: gS lengths [${key}]`);
            fs.appendFileSync('/tmp/nx_browser_cS_v2.jsonl', JSON.stringify({ count: cSCalls, hr: arr }) + '\n');
          }
        }
        // 检查是否接近 cookie 生成（比如捕获 50+ 次后）
        if (cSCalls >= 80) {
          phase = 'done';
          console.log('★ 收集完成');
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
      return;
    }
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 30000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 50000));
  console.log('[2] 完成. _\$cS 调用:', cSCalls, 'phase:', phase);
  try {
    const lines = fs.readFileSync('/tmp/nx_browser_cS_v2.jsonl', 'utf8').split('\n').filter(Boolean);
    console.log('记录数:', lines.length);
    const all = lines.map(l => JSON.parse(l));
    const big = all.filter(x => (x.hr || []).some(p => p && p.gS && p.gS.length > 100));
    console.log('gS > 100:', big.length);
    for (const b of big.slice(0, 5)) {
      console.log('  #' + b.count, (b.hr || []).filter(p => p && p.gS).map(p => 'gS' + p.gS.length).join(','));
    }
  } catch (e) {}
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
