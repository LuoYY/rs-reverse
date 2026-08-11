// buildEnv + while(3) 插桩：记录跳转（_$oL 变化 >1 的指令）
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

  // 插桩：记录 _\$oL 跳转（上一轮 pc 与当前 pc 差值 >1 的指令）
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){window.__prevOL=(window.__prevOL===void 0)?(_$oL-1):window.__prevOL;window.__curPC=_$oL-1;if(window.__prevOL!==(_$oL-1)&&Math.abs(window.__prevOL-(_$oL-1))>1){window.__w3j=window.__w3j||[];window.__w3j.push(window.__prevOL+"->"+(_$oL-1)+"(jump "+((_$oL-1)-window.__prevOL)+") op="+_$jc+"|lj="+(_$lj===void 0?"u":(_$lj?"T":"F")));if(window.__w3j.length>40)window.__w3j.shift();}window.__prevOL=_$oL-1;window.__w3n=(window.__w3n||0)+1;if(window.__w3n>200000){window.__w3trace=window.__w3trace||[];window.__w3trace.push("PC="+(_$oL-1)+" op="+_$jc);if(window.__w3trace.length>100)window.__w3trace.shift();throw new Error("W3_LOOP");}_$jc=_$ib[_$oL++];if(_$jc<444){';
  if (dynCode.indexOf(w3Pattern) >= 0) {
    dynCode = dynCode.split(w3Pattern).join(w3Inj);
    console.log('[TJ] while(3) 插桩 OK');
  } else {
    console.log('[TJ] ✗ 模式未找到');
    process.exit(1);
  }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[TJ] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[TJ] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const j = q('typeof __w3j!=="undefined"?__w3j:null');
  const tr = q('typeof __w3trace!=="undefined"?__w3trace:null');
  console.log('[TJ] 跳转记录:');
  if (Array.isArray(j)) console.log('[TJ]   ' + j.join('\n[TJ]   '));
  console.log('[TJ] 死循环 PC 轨迹:');
  if (Array.isArray(tr)) console.log('[TJ]   ' + tr.join('\n[TJ]   '));
  process.exit(0);
})().catch(e => { console.error('[TJ] FATAL:', e.message); process.exit(1); });
