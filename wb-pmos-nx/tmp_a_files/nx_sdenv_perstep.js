// while(3) 每步 try-catch，定位报错 opcode
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

  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });

  // while(3) 每步包裹：把整个 while 体 try-catch
  // 方案：把 opcode 分派后的执行体 try 包
  // 更简单：while(1){...} 里每步用 try{...执行体...}catch{记录}
  // 但执行体很大。改为：在 _$jc=_$ib[_$oL++]; 后记录，出错时最后一个 pc
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){_$jc=_$ib[_$oL++];window.__lastpc=_$oL-1;window.__lastop=_$jc;window.__step=(window.__step||0)+1;if(window.__step>1000000)throw new Error("STEP");if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[PS] 执行完成');
  } catch (e) {
    console.log('[PS] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[PS] 最后 pc:', q('typeof __lastpc!=="undefined"?__lastpc:null'));
  console.log('[PS] 最后 op:', q('typeof __lastop!=="undefined"?__lastop:null'));
  console.log('[PS] 步数:', q('typeof __step!=="undefined"?__step:0'));
  // 错误列号定位
  const d = require('./nx_ts_full2.json');
  const a0 = d.aebi[0];
  const lastpc = q('typeof __lastpc!=="undefined"?__lastpc:null');
  if (lastpc !== null) {
    console.log('[PS] aebi[0][lastpc]=', a0[lastpc], '附近:', a0.slice(Math.max(0, lastpc - 3), lastpc + 5).join(','));
  }
  process.exit(0);
})().catch(e => { console.error('[PS] FATAL:', e.message); process.exit(1); });
