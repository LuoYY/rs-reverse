// 检查 op204（_$a2=window）是否执行 + 记录触发前 pc
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

  // 注入 _$lj=false（模拟 sdenv）
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join('while(1){_$lj=false;_$jc=_$ib[_$oL++];window.__w3n=(window.__w3n||0)+1;if(window.__w3n>3000000)throw new Error("W3");if(_$jc<444){');

  // op204 追踪
  dynCode = dynCode.split('_$jc===204){_$a2=window;}').join('_$jc===204){window.__op204=(window.__op204||0)+1;window.__a2pc=_$oL-1;_$a2=window;}');
  // op227 追踪
  dynCode = dynCode.split('_$$p=_$a2[_$oU[88]];').join('window.__op227=window.__op227||[];window.__op227.push({pc:_$oL-1,a2:typeof _$a2,oj:typeof _$oU});_$$p=_$a2[_$oU[88]];');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 30000, filename: 'nx_dyn.js' });
    console.log('[O2] 执行完成');
  } catch (e) {
    console.log('[O2] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[O2] 列号:', col);
      console.log('[O2] 错误点:', dynCode.slice(col - 150, col + 150));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[O2] op204 执行次数:', q('typeof __op204!=="undefined"?__op204:null'));
  console.log('[O2] op204 pc:', q('typeof __a2pc!=="undefined"?__a2pc:null'));
  console.log('[O2] w3 次数:', q('typeof __w3n!=="undefined"?__w3n:0'));
  process.exit(0);
})().catch(e => { console.error('[O2] FATAL:', e.message); process.exit(1); });
