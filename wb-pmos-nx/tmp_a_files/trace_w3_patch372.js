// op372 强制退出 + w3 跳转追踪
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

  // op372 强制退出
  dynCode = dynCode.split('_$jc===372){debugger; !_$lj?_$oL+=2:0;}').join('_$jc===372){debugger;_$oL+=2;}');

  // w3 跳转追踪
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){window.__prevOL=(window.__prevOL===void 0)?(_$oL-1):window.__prevOL;window.__curPC=_$oL-1;if(window.__prevOL!==window.__curPC&&Math.abs(window.__prevOL-window.__curPC)>1){window.__w3j=window.__w3j||[];window.__w3j.push(window.__prevOL+"->"+window.__curPC+"(d"+((window.__curPC)-window.__prevOL)+") op="+_$jc+"|lj="+(_$lj===void 0?"u":(_$lj?"T":"F")));if(window.__w3j.length>30)window.__w3j.shift();}window.__prevOL=window.__curPC;window.__w3n=(window.__w3n||0)+1;if(window.__w3n>400000){window.__lastPc=window.__curPC;window.__lastOp=_$jc;throw new Error("W3_LOOP");}_$jc=_$ib[_$oL++];if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[TP] 执行完成');
  } catch (e) { console.log('[TP] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[TP] lastPc:', q('typeof __lastPc!=="undefined"?__lastPc:null'));
  console.log('[TP] lastOp:', q('typeof __lastOp!=="undefined"?__lastOp:null'));
  const j = q('typeof __w3j!=="undefined"?__w3j:null');
  console.log('[TP] 跳转:');
  if (Array.isArray(j)) console.log('[TP]   ' + j.join('\n[TP]   '));
  process.exit(0);
})().catch(e => { console.error('[TP] FATAL:', e.message); process.exit(1); });
