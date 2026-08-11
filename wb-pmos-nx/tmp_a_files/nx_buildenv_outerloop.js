// 定位外层 VM 死循环：while(1) 插桩 + 计数
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  const nsd = ts.nsd, cd = ts.cd;
  let outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  // 外层 VM while(1) 插桩
  let wIdx = 0;
  outerJsCode = outerJsCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>3000000)throw new Error("OUTER_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[OL] 外层 while 插桩:', wIdx);

  const env = buildEnv({ nsd, cd }, { target: TARGET, ua: UA, patchDyn: false, debugLog: false, waitMs: 0 });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd, cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  // 同步 timer
  let timerDepth = 0;
  const syncTimer = (fn, ms) => {
    timerDepth++;
    if (timerDepth > 200000) throw new Error('TIMER_DEPTH');
    try { if (typeof fn === 'function') fn(); } catch (e) { throw e; }
    timerDepth--;
    return 1;
  };
  sandbox.setTimeout = syncTimer;
  sandbox.setInterval = syncTimer;
  sandbox.requestAnimationFrame = syncTimer;

  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 25000, filename: 'outer.js' });
    console.log('[OL] outer 完成');
  } catch (e) {
    console.log('[OL] 错误:', e.message.substring(0, 120));
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[OL] while:', wq.join(' | '));
  console.log('[OL] lastW:', q('typeof __lastW!=="undefined"?__lastW:null'));
  process.exit(0);
})().catch(e => { console.error('[OL] FATAL:', e.message); process.exit(1); });
