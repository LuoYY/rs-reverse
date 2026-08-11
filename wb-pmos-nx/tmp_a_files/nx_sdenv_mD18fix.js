// 迭代修复：patch 跳转 + _$mD[18] 兜底 + 继续
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

  // 兜底：_$c7/_$av/_$d5 + op320 前 _$mD[18]
  const w3Var = 'var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];';
  dynCode = dynCode.split(w3Var).join(w3Var + '_$c7=_$c7===void 0?Object:_$c7;_$av=_$av===void 0?String:_$av;_$d5=_$d5===void 0?String.prototype:_$d5;_$mD=_$mD||[];_$jV=_$jV===void 0?Date:_$jV;');
  // op320 前兜底 _$mD[18]
  dynCode = dynCode.split('_$jc===320){_$mD[65]=_$mD[18].jf;}').join('_$jc===320){if(!_$mD[18])_$mD[18]=_$a2&&_$a2[_$b1[131]]||{};_$mD[65]=_$mD[18].jf;}');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[M8] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[M8] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[M8] 列号:', col, '错误点:', dynCode.slice(col - 80, col + 80));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[M8] cookie:', q('typeof document!=="undefined"&&document.cookie?document.cookie.slice(0,60):null'));
  process.exit(0);
})().catch(e => { console.error('[M8] FATAL:', e.message); process.exit(1); });
