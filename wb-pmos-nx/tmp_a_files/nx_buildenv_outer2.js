// buildEnv + 外层 VM（patch eval 捕获 dynCode 时打跳转 patch）+ 等待异步
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

  // 拦截 eval：dynCode 打跳转 patch
  const origRun = vm.runInContext;
  const origApply = Reflect.apply;
  // buildEnv 的 eval 是 Proxy，改 apply trap 不方便。直接 hook vm.runInContext 捕获 dynCode 后 patch 再执行
  // 但 buildEnv 内部 eval 用 Reflect.apply(target,...)，我们改 target
  // 简单：patch outerJsCode 里的 eval？不行。改用 hook vm.runInContext
  const hookedRun = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0) {
      // dynCode，打跳转 patch
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
      console.log('[BO] dynCode patched ' + c.length);
      return origRun(c, ctx, opts);
    }
    return origRun(code, ctx, opts);
  };
  vm.runInContext = hookedRun;

  // 执行外层 VM（同步，会卡在异步回调）
  const t0 = Date.now();
  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 20000, filename: 'outer.js' });
    console.log('[BO] outer 同步完成 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[BO] outer 错误:', e.message.substring(0, 100));
  }
  // 等待异步回调（buildEnv 的 setTimeout 异步）
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const cookies = env.captured.cookies;
    if (cookies.some(c => /P=/.test(c))) { console.log('[BO] P cookie 出现!'); break; }
  }
  console.log('[BO] cookies:', env.captured.cookies.length, env.captured.cookies.slice(-5));
  console.log('[BO] errors:', env.captured.errors.slice(-5));
  console.log('[BO] missing:', [...new Set(env.captured.missing)].slice(0, 10));
  process.exit(0);
})().catch(e => { console.error('[BO] FATAL:', e.message); process.exit(1); });
