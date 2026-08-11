// op372 强制退出后追踪 w3 的 pc 顺序（确认 pc30 是否执行）
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

  // op372 强制退出（只 patch pc16 那个？无法区分，全 patch）
  dynCode = dynCode.split('_$jc===372){debugger; !_$lj?_$oL+=2:0;}').join('_$jc===372){debugger;_$oL+=2;}');

  // w3 pc 顺序追踪（记录每 100 步的唯一 pc 序列）
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){window.__pcs=window.__pcs||[];window.__pcs.push(_$oL-1);if(window.__pcs.length>10000)window.__pcs.shift();window.__w3n=(window.__w3n||0)+1;if(window.__w3n>500000)throw new Error("W3");_$jc=_$ib[_$oL++];if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[TP] 执行完成');
  } catch (e) { console.log('[TP] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const pcs = q('typeof __pcs!=="undefined"?__pcs:null');
  if (Array.isArray(pcs)) {
    // 找唯一 pc 序列（压缩连续）
    const uniq = [];
    let prev = -1;
    for (const p of pcs) { if (p !== prev) { uniq.push(p); prev = p; } }
    console.log('[TP] 唯一 pc 序列:', uniq.slice(0, 120).join(','));
    console.log('[TP] 序列长度:', uniq.length);
    // 检查 pc30 是否出现
    console.log('[TP] pc30 出现:', uniq.includes(30), 'pc84 出现:', uniq.includes(84));
  }
  process.exit(0);
})().catch(e => { console.error('[TP] FATAL:', e.message); process.exit(1); });
