// 精确追踪 597-620 循环的 _$lj 变化
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

  dynCode = dynCode.split('_$jc===302){_$oL+=-9;}').join('_$jc===302){0;}');

  // 记录 pc:opcode:lj（读取后，但 lj 是执行前的值）
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){window.__ljRec=window.__ljRec||[];window.__ljRec.push((_$oL-1)+":"+_$jc+"|lj="+(_$lj===void 0?"u":(_$lj?"T":"F")));if(window.__ljRec.length>4000)window.__ljRec.shift();window.__w3n=(window.__w3n||0)+1;if(window.__w3n>100000)throw new Error("W3");_$jc=_$ib[_$oL++];if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[LJ] 执行完成');
  } catch (e) { console.log('[LJ] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const rec = q('typeof __ljRec!=="undefined"?__ljRec:null');
  if (Array.isArray(rec)) {
    // 找 597-620 循环段
    const seg = rec.filter(s => {
      const pc = parseInt(s.split(':')[0]);
      return pc >= 590 && pc <= 625;
    });
    console.log('[LJ] 597-625 区记录(后60):');
    console.log('[LJ]   ' + seg.slice(-60).join('\n[LJ]   '));
  }
  process.exit(0);
})().catch(e => { console.error('[LJ] FATAL:', e.message); process.exit(1); });
