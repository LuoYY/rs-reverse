// 全面 patch 所有回跳 opcode（302/69/126/225/65/373 等）+ 条件 _\$lj 跳转
// 策略：真实浏览器 _\$lj 动态变化，buildEnv 恒 true 导致回跳死循环
// patch 所有 _$oL+=-N 回跳 → 0（不跳），绕过所有 trap
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

  // 1. 所有 _\$oL+=-N（负回跳）→ 0
  const negJumps = dynCode.match(/_\$oL\+=-?\d+[^;]*;/g);
  const uniqNeg = [...new Set(negJumps || [])];
  console.log('[AJ] 负跳转:', uniqNeg.join(' | '));
  for (const j of uniqNeg) {
    if (j.startsWith('_$oL+=') && j.includes('-')) {
      dynCode = dynCode.split(j).join('0;');
      console.log('[AJ] patch: ' + j);
    }
  }
  // 2. 所有 !_\$lj? 条件跳转 → 0
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=[^;]+;/g, '0;');
  console.log('[AJ] !_\$lj 条件 patch');

  // while 插桩
  let wIdx = 0;
  dynCode = dynCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>10000000)throw new Error("ALL_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[AJ] while 插桩数量:', wIdx);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[AJ] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[AJ] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[AJ] 列号:', col);
      console.log('[AJ] 错误点:', dynCode.slice(col - 100, col + 100));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[AJ] while 计数:', wq.join(' | '));
  process.exit(0);
})().catch(e => { console.error('[AJ] FATAL:', e.message); process.exit(1); });
