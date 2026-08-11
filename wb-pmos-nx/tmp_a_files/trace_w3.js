// buildEnv + while(3) 插桩：记录 opcode/_$oL 轨迹，定位死循环条件
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

  // 插桩 while(3)：_$jc=_$ib[_$oL++]; 前记录 opcode + _$oL + _$lj
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){window.__w3n=(window.__w3n||0)+1;window.__w3t=window.__w3t||[];window.__w3t.push(_$jc+"@"+(_$oL-1)+"|lj="+(_$lj===void 0?"u":(_$lj===true?"T":"F")));if(window.__w3t.length>120)window.__w3t.shift();if(window.__w3n>300000)throw new Error("W3_LOOP at op="+_$jc+" pc="+(_$oL-1)+" lj="+_$lj);_$jc=_$ib[_$oL++];if(_$jc<444){';
  if (dynCode.indexOf(w3Pattern) >= 0) {
    dynCode = dynCode.split(w3Pattern).join(w3Inj);
    console.log('[T3] while(3) 插桩 OK');
  } else {
    console.log('[T3] ✗ 模式未找到');
    process.exit(1);
  }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[T3] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[T3] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const n = q('typeof __w3n!=="undefined"?__w3n:0');
  const t = q('typeof __w3t!=="undefined"?__w3t:null');
  console.log('[T3] w3 执行次数:', n);
  if (Array.isArray(t)) console.log('[T3] w3 轨迹(最后120):\n' + t.join('\n[T3]   '));
  process.exit(0);
})().catch(e => { console.error('[T3] FATAL:', e.message); process.exit(1); });
