// buildEnv + 强制 op372 退出循环（_$oL+=2 跳 302）
// 理论：op372 !_$lj?_$oL+=2:0 在 _$lj=true 时不跳（沙箱）→ 302 回跳死循环
// 真实浏览器 _$lj=false → _\$oL+=2 → 跳过 302 → 继续 pc21
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

  // op372: !_$lj?_$oL+=2:0 → 强制 _\$oL+=2（跳过 302）
  const p1 = '_$jc===372){debugger; !_$lj?_$oL+=2:0;}';
  if (dynCode.indexOf(p1) >= 0) {
    dynCode = dynCode.split(p1).join('_$jc===372){debugger;_$oL+=2;}');
    console.log('[P3] ✓ op372 强制退出');
  } else { console.log('[P3] ✗ op372 未找到'); process.exit(1); }

  // while 插桩
  let wIdx = 0;
  dynCode = dynCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>8000000)throw new Error("ALL_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[P3] while 插桩数量:', wIdx);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 30000, filename: 'nx_dyn.js' });
    console.log('[P3] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[P3] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[P3] while 计数:', wq.join(' | '));
  console.log('[P3] lastW:', q('typeof __lastW!=="undefined"?__lastW:null'));
  process.exit(0);
})().catch(e => { console.error('[P3] FATAL:', e.message); process.exit(1); });
