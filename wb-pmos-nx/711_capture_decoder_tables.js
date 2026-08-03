/**
 * 711_capture_decoder_tables.js
 * 在条件断点表达式里直接访问 _$pj 局部+闭包变量，一次抓全解码表：
 * _​$dh(输入) + _​$ks(索引) + _​$$g(常量表) + _​$hB(环境字符串)
 * 用于 Node 复现 _$pj 解码 → 理解 basearr 生成
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

  // 条件表达式直接访问闭包/局部变量
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  const cond = `(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), window.__pj = { dh: Array.from(_$dh), ks: Array.from(_$ks), g: Array.from(_$$g), hB: String(_$hB), dm: Array.from(_$dm), u: String(_$_u) }, true) : false`;
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: cond,
  });

  let pauseCount = 0, captured = false;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (!captured) {
      try {
        const r = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__pj)', returnByValue: true });
        const pj = JSON.parse(r.result?.value || 'null');
        if (pj) {
          captured = true;
          console.log('★ 解码表捕获:');
          console.log('  _​$dh len:', pj.dh.length, '头28:', pj.dh.slice(0, 28).join(','));
          console.log('  _​$ks len:', pj.ks.length, ':', pj.ks.join(','));
          console.log('  _​$$g len:', pj.g.length, '头60:', pj.g.slice(0, 60).join(','));
          console.log('  _​$hB:', pj.hB.substring(0, 80), '(len=' + pj.hB.length + ')');
          console.log('  _​$_u:', pj.u, '(code=' + (pj.u ? pj.u.charCodeAt(0) : '?') + ')');
          console.log('  _​$dm(当前 basearr) len:', pj.dm.length, ':', pj.dm.join(','));
          // 也存 basearr28
          const r2 = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap28)', returnByValue: true });
          console.log('  basearr28:', r2.result?.value);
          fs.writeFileSync('/tmp/nx_pj_tables.json', JSON.stringify(pj));
          fs.writeFileSync('/tmp/nx_pj_basearr28.json', r2.result?.value || '[]');
          console.log('已保存 /tmp/nx_pj_tables.json');
        }
      } catch (e) { console.log('捕获 err:', e.message.substring(0, 60)); }
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
