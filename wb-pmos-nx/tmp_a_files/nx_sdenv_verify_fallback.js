// 验证 _$d5 兜底是否生效（在 op340 前 dump）
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

  // 兜底 + dump op340
  const w3Var = 'var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];';
  dynCode = dynCode.split(w3Var).join(w3Var + '_$d5=_$d5===void 0?String.prototype:_$d5;window.__d5init=typeof _$d5;');
  dynCode = dynCode.split('_$jc===340){_$mD[30]=_$d5[_$oU[51]];}').join('_$jc===340){window.__d5at340=typeof _$d5;window.__d5v=_$d5?String(_$d5).slice(0,20):null;_$mD[30]=_$d5[_$oU[51]];}');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[VF] 执行完成');
  } catch (e) {
    console.log('[VF] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[VF] 列号:', col, '错误点:', dynCode.slice(col - 60, col + 60));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[VF] d5init:', q('typeof __d5init!=="undefined"?__d5init:null'));
  console.log('[VF] d5at340:', q('typeof __d5at340!=="undefined"?__d5at340:null'));
  console.log('[VF] d5v:', q('typeof __d5v!=="undefined"?__d5v:null'));
  process.exit(0);
})().catch(e => { console.error('[VF] FATAL:', e.message); process.exit(1); });
