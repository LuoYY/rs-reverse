// 精确 patch：只处理 `_$oL+=N:0` 三目（可安全替换为 0）和无条件 `_$oL+=-N;`
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const ts = JSON.parse(fs.readFileSync(path.join(__dirname, 'nx_ts_full2.json'), 'utf8'));
  let dynCode = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');

  // 1. 条件三目 `!_$lj?_$oL+=N:0;` → 0;  （带 :0）
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  console.log('[A2] 条件跳转 patch');

  // 2. 无条件负回跳 `_$oL+=-N:0;`（三目形式，else 0）→ 0;
  //    以及 `_$oL+=-N;`（无条件）→ 0;
  //    但要小心 `_$oL+=1:0;` 这种（正跳，可能是 op79 等必需）→ 保留
  //    只 patch 负跳（回跳 trap）
  dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m; // 负跳才 patch
  });
  console.log('[A2] 负跳三目 patch');
  dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  console.log('[A2] 负跳无条件 patch');

  // 3. 验证无语法破坏
  const syntaxCheck = dynCode.match(/_\$oL\+=-?\d+(?![:\d;])/g);
  console.log('[A2] 残留异常跳转:', syntaxCheck ? syntaxCheck.length : 0);

  // while 插桩
  let wIdx = 0;
  dynCode = dynCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>10000000)throw new Error("ALL_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[A2] while 插桩数量:', wIdx);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[A2] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[A2] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[A2] 列号:', col);
      console.log('[A2] 错误点:', dynCode.slice(col - 100, col + 100));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[A2] while 计数:', wq.join(' | '));
  process.exit(0);
})().catch(e => { console.error('[A2] FATAL:', e.message); process.exit(1); });
