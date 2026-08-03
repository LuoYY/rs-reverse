/**
 * 710_capture_pj_input.js
 * 捕获 _$pj 解码器的输入 _​$dh（basearr 编码数据源）+ 解码表 _​$$g + _​$ks + _​$hB
 * 条件断点暂停在 push 时，直接访问 _$pj 函数作用域局部变量
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

  // 条件断点：len=28 时捕获 basearr + _$pj 的输入/解码表
  // 用 callFrames 无法在条件里获取，改为暂停时通过 scope 提取
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), window.__stack28 = new Error().stack, true) : false',
  });

  let pauseCount = 0, captured = false, frameLog = 0;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (!captured && params.callFrames && params.callFrames.length >= 2) {
      // 打印帧分布（限 3 次）
      if (frameLog < 3) {
        frameLog++;
        const names = params.callFrames.slice(0, 5).map(f => `${f.functionName || '(anon)'}@${f.location.lineNumber}:${f.location.columnNumber}`).join(' <- ');
        console.log(`[暂停帧] ${names}`);
      }
      // frame[1] = push 调用者，提取其局部变量（尝试所有帧找 _$pj）
      let found = false;
      for (const frame of params.callFrames) {
        const fnName = frame.functionName || '';
        if (fnName === '_$pj') {
        try {
          const scope = frame.scopeChain.find(s => s.type === 'closure' || s.type === 'local');
          if (scope) {
            const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
            const vars = {};
            for (const p of props.result || []) {
              if (['_$dh', '_​$dm', '_​$ks', '_​$$g', '_​$hB'].includes(p.name)) {
                try {
                  const v = await cdp.send('Runtime.callFunctionOn', {
                    functionDeclaration: 'function(){ try { return JSON.stringify(this); } catch(e) { return "UNSERIALIZABLE:" + typeof this; } }',
                    objectId: p.value.objectId,
                    returnByValue: true,
                  });
                  vars[p.name] = v.result?.value;
                } catch (e) { vars[p.name] = 'ERR:' + e.message.substring(0, 40); }
              }
            }
            console.log('★ _$pj 局部变量捕获:');
            for (const [k, v] of Object.entries(vars)) {
              console.log(`  ${k}: ${typeof v === 'string' && v.length > 200 ? v.substring(0, 200) + '...(len=' + v.length + ')' : v}`);
            }
            fs.writeFileSync('/tmp/nx_pj_vars.json', JSON.stringify(vars));
            console.log('已保存 /tmp/nx_pj_vars.json');
            captured = true;
          }
        } catch (e) { console.log('scope 提取失败:', e.message.substring(0, 80)); }
        }
      }
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  console.log('[1] 加载固定环境...');
  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 32000));
  console.log('[2] 总暂停:', pauseCount, '捕获:', captured);
  if (!captured) {
    // 兜底：直接 evaluate window.__cap28
    const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap28)', returnByValue: true });
    console.log('basearr28:', r.result?.value);
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
