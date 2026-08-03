/**
 * 713_eval_on_frame.js
 * 用 Debugger.evaluateOnCallFrame 在 _$pj 帧上下文提取解码表：
 * _​$dh/_​$ks/_​$$g/_​$hB/_​$dm/_​$_u
 * 调用帧上下文可访问局部变量 + 全部闭包变量
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
    condition: '(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), true) : false',
  });

  let pauseCount = 0, captured = false;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (!captured) {
      try {
        let pjFrame = null;
        for (const f of params.callFrames || []) {
          if ((f.functionName || '') === '_$pj') { pjFrame = f; break; }
        }
        if (!pjFrame) { await cdp.send('Debugger.resume').catch(() => {}); return; }
        console.log('★ _$pj 帧 @' + pjFrame.location.lineNumber + ':' + pjFrame.location.columnNumber);

        const vars = {};
        const exprs = {
          dh: 'Array.isArray(_$dh) ? JSON.stringify(Array.from(_$dh)) : String(_$dh)',
          ks: 'Array.isArray(_$ks) ? JSON.stringify(Array.from(_$ks)) : String(_$ks)',
          g: 'Array.isArray(_$$g) ? JSON.stringify(Array.from(_$$g)) : String(_$$g)',
          hB: 'String(_$hB)',
          dm: 'Array.isArray(_$dm) ? JSON.stringify(Array.from(_$dm)) : String(_$dm)',
          u: 'String(_$_u)',
          dmLen: '(_$dm && _$dm.length) ? _$dm.length : 0',
        };
        for (const [k, expr] of Object.entries(exprs)) {
          try {
            const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: pjFrame.callFrameId, expression: expr, returnByValue: true });
            vars[k] = r.result?.value;
            console.log(`  ${k}: ${String(r.result?.value).substring(0, 150)}`);
          } catch (e) { vars[k] = 'ERR:' + e.message.substring(0, 50); console.log(`  ${k}: ERR ${e.message.substring(0, 50)}`); }
        }
        const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap28)', returnByValue: true });
        vars.basearr28 = r.result?.value;
        console.log('  basearr28:', vars.basearr28);
        fs.writeFileSync('/tmp/nx_pj_tables.json', JSON.stringify(vars));
        console.log('已保存 /tmp/nx_pj_tables.json');
        captured = true;
      } catch (e) { console.log('捕获 err:', e.message.substring(0, 80)); }
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] 加载固定环境...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 32000));
  console.log('[2] 总暂停:', pauseCount, '捕获:', captured);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
