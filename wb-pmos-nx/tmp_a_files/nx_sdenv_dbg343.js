// op343 前 dump _$a2 状态（_$_f=_$a2[_$oP[148]]，oP[148]="Number"）
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
  dynCode = dynCode.split('_$lj= !_$c7[_$oP[75]];').join('_$lj=0;');

  // op343 前 dump（错误点 260705 是 op343）
  dynCode = dynCode.split('_$_f=_$a2[_$oP[148]];').join('window.__dbg343={a2:typeof _$a2,a2keys:_$a2&&typeof _$a2==="object"?Object.keys(_$a2).slice(0,30):null,oP148:Array.isArray(_$oP)?_$oP[148]:null,num:typeof Number};_$_f=_$a2[_$oP[148]];');
  console.log('[D3] op343 dump 插桩');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[D3] 执行完成');
  } catch (e) {
    console.log('[D3] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[D3] 列号:', col, '错误点:', dynCode.slice(col - 80, col + 80));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[D3] dump:', q('typeof __dbg343!=="undefined"?JSON.stringify(__dbg343).slice(0,300):null'));
  process.exit(0);
})().catch(e => { console.error('[D3] FATAL:', e.message); process.exit(1); });
