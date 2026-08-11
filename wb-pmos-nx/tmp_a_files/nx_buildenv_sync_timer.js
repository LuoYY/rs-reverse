// buildEnv + 同步 setTimeout（回调立即执行）+ 外层 VM + 跳转 patch
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  const nsd = ts.nsd, cd = ts.cd;

  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const env = buildEnv({ nsd, cd }, { target: TARGET, ua: UA, patchDyn: false, debugLog: false, waitMs: 0 });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd, cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  // 同步 setTimeout：回调立即执行（避免外层 VM 死锁）
  // 但递归同步回调可能无限递归——加深度限制
  let timerDepth = 0;
  const syncSetTimeout = (fn, ms) => {
    timerDepth++;
    if (timerDepth > 100000) throw new Error('TIMER_DEPTH');
    try { if (typeof fn === 'function') fn(); } catch (e) { throw e; }
    timerDepth--;
    return 1;
  };
  sandbox.setTimeout = syncSetTimeout;
  sandbox.setInterval = syncSetTimeout;
  sandbox.requestAnimationFrame = syncSetTimeout;

  // hook vm.runInContext：dynCode 跳转 patch
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0) {
      let c = code;
      c = c.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
      c = c.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
        const n = parseInt(m.match(/-?\d+/)[0]);
        return n < 0 ? '0;' : m;
      });
      c = c.replace(/_\$oL\+=-?\d+;/g, (m) => {
        const n = parseInt(m.match(/-?\d+/)[0]);
        return n < 0 ? '0;' : m;
      });
      console.log('[ST] dynCode patched ' + c.length);
      return origRun(c, ctx, opts);
    }
    return origRun(code, ctx, opts);
  };

  const t0 = Date.now();
  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 30000, filename: 'outer.js' });
    console.log('[ST] outer 完成 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[ST] 错误:', e.message.substring(0, 150));
    console.log('[ST] 栈:', (e.stack || '').split('\n').slice(0, 5).join('\n[ST]   '));
  }
  console.log('[ST] cookies:', env.captured.cookies.length, env.captured.cookies.slice(-5));
  console.log('[ST] errors:', env.captured.errors.slice(-5));
  process.exit(0);
})().catch(e => { console.error('[ST] FATAL:', e.message); process.exit(1); });
