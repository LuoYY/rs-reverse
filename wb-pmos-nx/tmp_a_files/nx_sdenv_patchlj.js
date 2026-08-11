// buildEnv + patch _$lj 条件跳转（反调试死循环绕过）
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

  // patch 关键 _$lj 条件跳转（参考 xj patchLoop：op225/op69 等）
  // 这些是环境检测分支，sandbox 中 _$lj=false 会回跳死循环
  const patches = [
    ['_$jc===69){ !_$lj?_$oL+=-24:0;}', '_$jc===69){0;}'],          // op69 回跳 -24（死循环点）
    ['_$jc===225){ !_$lj?_$oL+=-41:0;}', '_$jc===225){0;}'],        // op225
    ['_$jc===126){ !_$lj?_$oL+=-51:0;}', '_$jc===126){0;}'],        // op126
    ['_$jc===65){ !_$lj?_$oL+=-156:0;}', '_$jc===65){0;}'],         // op65
    ['_$jc===128){ !_$lj?_$oL+=5:0;}', '_$jc===128){0;}'],          // op128
    ['_$jc===321){ !_$lj?_$oL+=114:0;}', '_$jc===321){0;}'],
    ['_$jc===331){ !_$lj?_$oL+=-120:0;}', '_$jc===331){0;}'],
    ['_$jc===338){ !_$lj?_$oL+=-114:0;}', '_$jc===338){0;}'],
    ['_$jc===372){ !_$lj?_$oL+=2:0;}', '_$jc===372){0;}'],
    ['_$jc===377){ !_$lj?_$oL+=1:0;}', '_$jc===377){0;}'],
  ];
  let pc = 0;
  for (const [oldS, newS] of patches) {
    if (dynCode.indexOf(oldS) >= 0) {
      dynCode = dynCode.split(oldS).join(newS);
      pc++;
      console.log('[PL] ✓ patch: ' + oldS.slice(0, 50));
    } else {
      console.log('[PL] ✗ 未找到: ' + oldS.slice(0, 50));
    }
  }
  console.log('[PL] patch 完成: ' + pc + '/' + patches.length);

  // while 插桩（限次 + 定位）
  let wIdx = 0;
  dynCode = dynCode.replace(/while\(1\)\{/g, () => {
    wIdx++;
    return 'while(1){window.__w' + wIdx + '=(window.__w' + wIdx + '||0)+1;window.__lastW=' + wIdx + ';if(window.__all>5000000)throw new Error("ALL_LOOP_w' + wIdx + '");window.__all=(window.__all||0)+1;';
  });
  console.log('[PL] while 插桩数量:', wIdx);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 30000, filename: 'nx_dyn.js' });
    console.log('[PL] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[PL] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const wq = [];
  for (let i = 1; i <= wIdx; i++) {
    const n = q(`typeof __w${i}!=="undefined"?__w${i}:0`);
    if (n > 0) wq.push('w' + i + '=' + n);
  }
  console.log('[PL] while 计数:', wq.join(' | '));
  console.log('[PL] lastW:', q('typeof __lastW!=="undefined"?__lastW:null'));
  process.exit(0);
})().catch(e => { console.error('[PL] FATAL:', e.message); process.exit(1); });
