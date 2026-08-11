// nx 专用 buildEnv：同步 timer + eval Proxy 内打 _$lj patch + 跑外层 VM
// 目标：外层 VM 设置引擎闭包状态 → dynCode 能跑 → 生成 P cookie
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

// 复用 buildEnv（把 sandbox 导出后改 timer + eval patch）
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

function patchJumps(code) {
  code = code.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  code = code.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  code = code.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  // 兜底关键变量
  code = code.replace('var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];',
    'var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];_$d5=_$d5===void 0?String.prototype:_$d5;_$c7=_$c7===void 0?Object:_$c7;_$av=_$av===void 0?String:_$av;_$mD=_$mD||[];_$jV=_$jV===void 0?Date:_$jV;');
  return code;
}

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  const nsd = ts.nsd, cd = ts.cd;
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');

  const env = buildEnv({ nsd, cd }, { target: TARGET, ua: UA, patchDyn: false, debugLog: false, waitMs: 0 });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd, cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  // ★ 同步 timer（避免外层 VM 异步死锁）
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

  // ★ 外层 VM 内的 eval 替换：在 vm context 里包一层，拦截 dynCode 打 patch
  // buildEnv 的 eval 是 neProxy（vm 内 eval 的 Proxy），我们在 sandbox.eval 上再包一层？
  // 不行——外层 VM 检测 eval.toString。改为：直接替换 dynCode 捕获点。
  // 用 vm.runInContext 执行 outerJsCode 前，先把 sandbox.eval 换成"patch 版"（保留 toString 伪装）
  const origEvalFn = sandbox.eval;
  const patchedEval = new Proxy(function () {}, {
    apply(target, thisArg, args) {
      let code = args[0];
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0) {
        const patched = patchJumps(code);
        console.log('[BF] dynCode patched ' + code.length + ' → ' + patched.length);
        // 用原生 vm eval 执行（同 buildEnv neProxy 逻辑）
        return origEvalFn(patched);
      }
      return origEvalFn(code);
    },
    get(target, p) {
      if (p === 'toString') return () => 'function eval() { [native code] }';
      return origEvalFn[p];
    },
  });
  sandbox.eval = patchedEval;

  const t0 = Date.now();
  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 40000, filename: 'outer.js' });
    console.log('[BF] outer 完成 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[BF] outer 错误:', e.message.substring(0, 150));
    console.log('[BF] 栈:', (e.stack || '').split('\n').slice(0, 5).join('\n[BF]   '));
  }
  console.log('[BF] cookies:', env.captured.cookies.length, env.captured.cookies.slice(-5));
  console.log('[BF] errors:', env.captured.errors.slice(-5));
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[BF] P:', q('typeof document!=="undefined"&&document.cookie?(document.cookie.match(/P=([^;]*)/)||[])[1]||"no":null'));
  process.exit(0);
})().catch(e => { console.error('[BF] FATAL:', e.message); process.exit(1); });
