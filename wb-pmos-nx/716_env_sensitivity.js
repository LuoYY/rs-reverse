/**
 * 716_env_sensitivity.js
 * 固定环境（nsd=73355）多次加载，对比 _$dh 哪些位置每次变（环境检测）vs 固定（keys派生）
 * 定位 basearr[25-28] 的输入源性质
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const CHROMIUM = '/Applications/Chromium.app/Contents/MacOS/Chromium';
const PROXY = 'http://127.0.0.1:9000';

async function captureDh(cdp, pushR) {
  // 条件：len=28 时存 basearr28 + 后续用 evaluateOnCallFrame 提取 _$dh
  return new Promise(async (resolve) => {
    let done = false;
    const handler = async (params) => {
      if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
      try {
        let pjFrame = null;
        for (const f of params.callFrames || []) {
          if ((f.functionName || '') === '_$pj') { pjFrame = f; break; }
        }
        if (pjFrame) {
          const r1 = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: pjFrame.callFrameId, expression: 'Array.isArray(_$dh) ? JSON.stringify(Array.from(_$dh)) : "NA"', returnByValue: true });
          const r2 = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__cap28)', returnByValue: true });
          done = true;
          cdp.off('Debugger.paused', handler);
          resolve({ dh: JSON.parse(r1.result?.value || '[]'), b28: JSON.parse(r2.result?.value || '[]') });
        }
      } catch (e) {}
      await cdp.send('Debugger.resume').catch(() => {});
    };
    cdp.on('Debugger.paused', handler);
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM, headless: true,
    proxy: { server: PROXY },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });

  const rounds = [];
  for (let i = 0; i < 3; i++) {
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
    const p = captureDh(cdp, pushR);
    await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
    await new Promise(r => setTimeout(r, 12000));
    const res = await Promise.race([p, new Promise(r => setTimeout(() => r(null), 8000))]);
    if (res) {
      console.log(`[R${i + 1}] dh len=${res.dh.length}`);
      console.log(`  dh[0-31]: ${res.dh.slice(0, 32).join(',')}`);
      console.log(`  b28[24-27]: ${res.b28.slice(24, 28).join(',')}`);
      rounds.push(res);
    } else {
      console.log(`[R${i + 1}] 未捕获`);
    }
    await context.close();
  }

  // 对比
  if (rounds.length >= 2) {
    const a = rounds[0].dh, b = rounds[1].dh;
    const diffs = [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) diffs.push(`${i}:${a[i]}→${b[i]}`);
    }
    console.log('\n=== R1 vs R2 差异位置 ===');
    console.log('差异数:', diffs.length);
    console.log(diffs.join(' '));
    fs.writeFileSync('/tmp/nx_env_diffs.json', JSON.stringify({ rounds, diffs }));
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
