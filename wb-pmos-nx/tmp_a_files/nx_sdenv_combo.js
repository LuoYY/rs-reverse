// 组合 patch：302 不跳 + op204 强制 _$a2=window
// 思路：_$lj 在真实浏览器早期 false（跳过 302 段），buildEnv true（进 302 死循环）
// 干脆让 302 全不跳（_$oL+=0），op204 强制执行保证 _$a2 初始化
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

  // 1. 所有 op302（_$oL+=-9）→ 0（不跳）
  dynCode = dynCode.split('_$jc===302){_$oL+=-9;}').join('_$jc===302){0;}');
  console.log('[CB] op302 patch');

  // 2. op204 强制 _$a2=window（保持原逻辑，pc 序列应自然执行到）
  // 3. while 插桩（限次）
  let wIdx = 0;
  dynCode = dynCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>10000000)throw new Error("ALL_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[CB] while 插桩数量:', wIdx);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[CB] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[CB] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[CB] 列号:', col);
      console.log('[CB] 错误点:', dynCode.slice(col - 120, col + 120));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[CB] while 计数:', wq.join(' | '));
  process.exit(0);
})().catch(e => { console.error('[CB] FATAL:', e.message); process.exit(1); });
