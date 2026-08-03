/**
 * 717_ua_sensitivity.js
 * 固定 nsd/cd 下测试不同 UA/环境指纹对 _$dh 的影响：
 * - 若 _$dh 随 UA 变 → f(nsd,cd,环境指纹) → 需复现环境指纹
 * - 若 _$dh 不变 → f(nsd,cd) → 纯算法可生成！
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';

const UAS = {
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  linuxFF: 'Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0',
};

async function captureOne(browser, ua) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: ua });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length === 28 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && !window.__cap28) ? (window.__cap28 = Array.from(this), true) : false',
  });
  const result = await new Promise(async (resolve) => {
    const handler = async (params) => {
      try {
        let pjFrame = null;
        for (const f of params.callFrames || []) {
          if ((f.functionName || '') === '_$pj') { pjFrame = f; break; }
        }
        if (pjFrame) {
          const r1 = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: pjFrame.callFrameId, expression: 'Array.isArray(_$dh) ? JSON.stringify(Array.from(_$dh)) : "NA"', returnByValue: true });
          cdp.off('Debugger.paused', handler);
          resolve(JSON.parse(r1.result?.value || '[]'));
          return;
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
    };
    cdp.on('Debugger.paused', handler);
    await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
    await new Promise(r => setTimeout(r, 13000));
    setTimeout(() => resolve(null), 5000);
  });
  await context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });

  const results = {};
  for (const [name, ua] of Object.entries(UAS)) {
    const dh = await captureOne(browser, ua);
    if (dh && dh.length) {
      results[name] = dh;
      console.log(`[${name}] dh len=${dh.length} [0-31]: ${dh.slice(0, 32).join(',')}`);
      console.log(`  [24-28]: ${dh.slice(24, 29).join(',')}`);
    } else {
      results[name] = null;
      console.log(`[${name}] 未捕获`);
    }
  }

  // 对比
  const names = Object.keys(results).filter(n => results[n]);
  console.log('\n=== 跨 UA 对比 ===');
  if (names.length >= 2) {
    const base = results[names[0]];
    for (const n of names.slice(1)) {
      const diffs = [];
      for (let i = 0; i < Math.min(base.length, results[n].length); i++) {
        if (base[i] !== results[n][i]) diffs.push(`${i}:${base[i]}→${results[n][i]}`);
      }
      console.log(`${names[0]} vs ${n}: 差异 ${diffs.length} 处${diffs.length ? ' → ' + diffs.slice(0, 15).join(' ') : ' → ★★★ 完全相同！'}`);
    }
  }
  fs.writeFileSync('/tmp/nx_ua_diffs.json', JSON.stringify(results));
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
