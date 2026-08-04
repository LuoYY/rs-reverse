/**
 * 728_A45_browser_closure.js
 * 在 basearr push 断点，从 _\$cS 帧的 scope 链读取闭包变量（找 597 环境池）
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
        const frames = params.callFrames || [];
        const out = { basearr: arr, scopes: [] };
        for (let fi = 0; fi < Math.min(frames.length, 4); fi++) {
          const f = frames[fi];
          const frameInfo = { fn: f.functionName || '(anon)', scopeChain: [] };
          for (let si = 0; si < (f.scopeChain || []).length; si++) {
            const scope = f.scopeChain[si];
            const scopeInfo = { type: scope.type, vars: {} };
            try {
              const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true }).catch(() => null);
              if (props && props.result) {
                for (const p of props.result) {
                  if (p.name && !p.name.startsWith('__')) {
                    const v = p.value;
                    let desc = '';
                    if (v && v.type === 'object') {
                      try {
                        const lenR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: `typeof ${p.name} === 'object' && ${p.name} !== null ? (Array.isArray(${p.name}) ? 'arr/' + ${p.name}.length : 'obj/' + Object.keys(${p.name}).length) : 'other'`, returnByValue: true });
                        desc = lenR.result?.value;
                        // 对长度 500-700 的数组，重点 dump 内容
                        if (typeof desc === 'string' && desc.startsWith('arr/') && +desc.split('/')[1] > 300 && +desc.split('/')[1] < 900) {
                          const contR = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f.callFrameId, expression: `JSON.stringify(${p.name}.slice(0,120))`, returnByValue: true });
                          desc += ' content:' + (contR.result?.value || '').substring(0, 400);
                        }
                      } catch (e) { desc = 'obj'; }
                    } else if (v) {
                      desc = `${v.type}:${String(v.value !== undefined ? v.value : v.description).substring(0, 80)}`;
                    }
                    scopeInfo.vars[p.name] = desc;
                  }
                }
              }
            } catch (e) {}
            frameInfo.scopeChain.push(scopeInfo);
          }
          out.scopes.push(frameInfo);
        }
        fs.writeFileSync('/tmp/nx_browser_scopes.json', JSON.stringify(out, null, 1));
        console.log('保存 /tmp/nx_browser_scopes.json');
        for (const f of out.scopes) {
          console.log(`== ${f.fn}`);
          for (const s of f.scopeChain) {
            const interesting = Object.entries(s.vars).filter(([k, v]) => String(v).includes('arr/') || String(v).includes('obj/'));
            if (interesting.length) console.log(`  scope(${s.type}):`, JSON.stringify(interesting).substring(0, 1200));
          }
        }
        await cdp.send('Debugger.resume').catch(() => {});
        return;
      }
    } catch (e) {}
    await cdp.send('Debugger.resume').catch(() => {});
  };
  cdp.on('Debugger.paused', handler);

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 40000));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
