// 在 buildEnv 直接跑 dynCode 时，捕获 _$k0 数字池（_$k0=_$nP(_$ez) 生成点）
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

  // patch 跳转
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });

  // 捕获 _$k0（while(3) 开头，_$k0 可能已由 while(4) 生成）
  const w3Var = 'var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];';
  dynCode = dynCode.split(w3Var).join(w3Var + 'if(typeof _$k0!=="undefined"){window.__k0capture={types:_$k0.slice(0,50).map(function(x){return typeof x;}),vals:_$k0.slice(0,50)};}');
  console.log('[KC] _$k0 捕获插桩');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[KC] 执行完成');
  } catch (e) { console.log('[KC] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const cap = q('typeof __k0capture!=="undefined"?__k0capture:null');
  console.log('[KC] 捕获:', cap ? (cap.types.slice(0, 10).join(',') + ' | ' + JSON.stringify(cap.vals.slice(0, 10))) : 'null');
  process.exit(0);
})().catch(e => { console.error('[KC] FATAL:', e.message); process.exit(1); });
