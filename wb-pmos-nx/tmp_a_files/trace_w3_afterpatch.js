// patch 所有 !_$lj? 后，追踪 w3 死循环的 PC 轨迹
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

  // 全量 patch _\$lj
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=[^;]+;/g, '0;');

  // w3 轨迹插桩（opcode + pc + 跳转）
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){window.__prevOL=(window.__prevOL===void 0)?(_$oL-1):window.__prevOL;window.__curPC=_$oL-1;if(window.__prevOL!==window.__curPC&&Math.abs(window.__prevOL-window.__curPC)>1){window.__w3j=window.__w3j||[];window.__w3j.push(window.__prevOL+"->"+window.__curPC+"(d"+((window.__curPC)-window.__prevOL)+") op="+_$jc);if(window.__w3j.length>30)window.__w3j.shift();}window.__prevOL=window.__curPC;window.__w3n=(window.__w3n||0)+1;if(window.__w3n>400000){window.__lastPc=window.__curPC;window.__lastOp=_$jc;throw new Error("W3_LOOP");}_$jc=_$ib[_$oL++];if(_$jc<444){';
  if (dynCode.indexOf(w3Pattern) >= 0) {
    dynCode = dynCode.split(w3Pattern).join(w3Inj);
    console.log('[TW] w3 插桩 OK');
  } else { console.log('[TW] ✗ 未找到'); process.exit(1); }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[TW] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[TW] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[TW] lastPc:', q('typeof __lastPc!=="undefined"?__lastPc:null'));
  console.log('[TW] lastOp:', q('typeof __lastOp!=="undefined"?__lastOp:null'));
  const j = q('typeof __w3j!=="undefined"?__w3j:null');
  console.log('[TW] 跳转记录:');
  if (Array.isArray(j)) console.log('[TW]   ' + j.join('\n[TW]   '));
  process.exit(0);
})().catch(e => { console.error('[TW] FATAL:', e.message); process.exit(1); });
