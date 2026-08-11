// buildEnv + 全量 patch 23 个 '!_$lj?' 条件跳转（反调试分支 → 0）
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

  // 全量 patch：所有 '!_$lj?XXX:0;' → '0;'
  const re = /!_\$lj\?[^;]{0,20};/g;
  const all = dynCode.match(re) || [];
  const uniq = [...new Set(all)];
  console.log('[PA] 找到 ' + uniq.length + ' 个唯一形式');
  // 用全局替换（保留 :0 结构但不跳转）→ 直接删掉条件，只留 0
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=[^;]+;/g, '0;');
  // 验证
  const after = dynCode.match(/!_\$lj\?/g) || [];
  console.log('[PA] patch 后剩余 !_$lj?: ' + after.length);
  if (after.length > 0) {
    // 兜底：把剩余的都替换
    dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=[^;]+;/g, '0;');
  }

  // while 插桩
  let wIdx = 0;
  dynCode = dynCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>8000000)throw new Error("ALL_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[PA] while 插桩数量:', wIdx);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 30000, filename: 'nx_dyn.js' });
    console.log('[PA] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[PA] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[PA] while 计数:', wq.join(' | '));
  console.log('[PA] lastW:', q('typeof __lastW!=="undefined"?__lastW:null'));
  process.exit(0);
})().catch(e => { console.error('[PA] FATAL:', e.message); process.exit(1); });
