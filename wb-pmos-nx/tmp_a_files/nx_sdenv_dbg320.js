// dump op320 前 _$mD[18] 状态 + op425 执行标记
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

  const w3Var = 'var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];';
  dynCode = dynCode.split(w3Var).join(w3Var + '_$c7=_$c7||Object;_$av=_$av||String;_$d5=_$d5||String.prototype;');

  // op425 标记 + op320 dump
  dynCode = dynCode.split('_$jc===425){_$mD[18]=_$a2[_$b1[131]];}').join('_$jc===425){window.__op425=(window.__op425||0)+1;window.__mD18_425=typeof _$mD[18];_$mD[18]=_$a2[_$b1[131]];}');
  dynCode = dynCode.split('_$jc===320){_$mD[65]=_$mD[18].jf;}').join('_$jc===320){window.__dbg320={pc:_$oL-1,mD18:typeof _$mD[18],mD18v:typeof _$mD[18]!=="undefined"&&_$mD[18]?(typeof _$mD[18].jf):null};_$mD[65]=_$mD[18].jf;}');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[D8] 执行完成');
  } catch (e) {
    console.log('[D8] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[D8] 列号:', col, '错误点:', dynCode.slice(col - 60, col + 60));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[D8] op425 次数:', q('typeof __op425!=="undefined"?__op425:null'));
  console.log('[D8] mD18_425:', q('typeof __mD18_425!=="undefined"?__mD18_425:null'));
  console.log('[D8] dbg320:', q('typeof __dbg320!=="undefined"?JSON.stringify(__dbg320):null'));
  process.exit(0);
})().catch(e => { console.error('[D8] FATAL:', e.message); process.exit(1); });
