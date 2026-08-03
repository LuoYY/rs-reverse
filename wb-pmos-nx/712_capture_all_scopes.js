/**
 * 712_capture_all_scopes.js
 * 暂停后遍历 callFrames 所有帧 + 所有 scopeChain，提取 _$pj 的解码表：
 * _​$dh/_​$ks/_​$$g/_​$hB/_​$dm/_​$_u
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';

async function trySerialize(cdp, objId, depth) {
  try {
    const r = await cdp.send('Runtime.callFunctionOn', {
      functionDeclaration: 'function(){ try { var s = JSON.stringify(this); if (s && s.length > 8000) s = "[" + this.length + " items]"; return s; } catch(e) { return "UNSERIALIZABLE:" + typeof this; } }',
      objectId: objId,
      returnByValue: true,
    });
    return r.result?.value;
  } catch (e) { return 'ERR'; }
}

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
        // 找 _$pj 帧
        let pjFrame = null;
        for (const f of params.callFrames || []) {
          if ((f.functionName || '') === '_$pj') { pjFrame = f; break; }
        }
        if (!pjFrame) { await cdp.send('Debugger.resume').catch(() => {}); return; }
        console.log('★ 找到 _$pj 帧 @' + pjFrame.location.lineNumber + ':' + pjFrame.location.columnNumber);

        const vars = {};
        // 遍历该帧所有 scope
        for (const sc of pjFrame.scopeChain || []) {
          if (sc.type === 'global' || sc.type === 'script') continue;
          const props = await cdp.send('Runtime.getProperties', { objectId: sc.object.objectId, ownProperties: true });
          for (const p of props.result || []) {
            if (['_$dh', '_​$ks', '_​$$g', '_​$hB', '_​$dm', '_​$_u', '_​$ck', '_​$mO'].includes(p.name)) {
              if (!vars[p.name]) {
                let val;
                if (p.value && p.value.objectId) {
                  val = await trySerialize(cdp, p.value.objectId, 0);
                } else if (p.value) {
                  val = p.value.value !== undefined ? JSON.stringify(p.value.value) : String(p.value);
                } else { val = 'NOVALUE'; }
                vars[p.name] = val;
                console.log(`  ${p.name} (scope=${sc.type}): ${String(val).substring(0, 120)}`);
              }
            }
          }
        }
        const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap28)', returnByValue: true });
        console.log('  basearr28:', r.result?.value);
        vars.basearr28 = r.result?.value;
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
