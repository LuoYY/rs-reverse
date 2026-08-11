// _$c7 注入验证（带标记）+ 错误点 patch 兜底
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

  // 在 _$c7 声明处（外层 var 后）注入
  const c7Var = 'var _$b3,_$pR,_$pl,_$jR,_$c7,';
  dynCode = dynCode.split(c7Var).join(c7Var + '_$c7=Object;');
  console.log('[C5] _$c7=Object 注入（外层 var）');
  // 验证注入
  console.log('[C5] 注入后含 _$c7=Object:', dynCode.indexOf('_$c7=Object;') >= 0);

  // op339 兜底（万一）
  dynCode = dynCode.split('_$lj= !_$c7[_$oP[75]];').join('_$lj= !((_$c7||Object)[_$oP[75]]);');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[C5] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[C5] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[C5] 列号:', col, '错误点:', dynCode.slice(col - 80, col + 80));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[C5] cookie:', q('typeof document!=="undefined"&&document.cookie?document.cookie.slice(0,60):null'));
  process.exit(0);
})().catch(e => { console.error('[C5] FATAL:', e.message); process.exit(1); });
