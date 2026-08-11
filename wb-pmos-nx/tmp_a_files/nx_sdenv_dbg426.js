// dump op426 前后 _$av/_$d5 状态
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

  // op308 前 dump
  dynCode = dynCode.split('_$jc===308){_$av=String;}').join('_$jc===308){window.__dbg308={pc:_$oL-1,av:typeof _$av,str:typeof String};_$av=String;window.__dbg308b={av2:typeof _$av};}');
  // op426 前 dump（op426 是 else 分支 _\$d5=_$av[...]，用 _$av[ 定位）
  dynCode = dynCode.split('_$d5=_$av[_$oU[2]];').join('window.__dbg426={pc:_$oL-1,av:typeof _$av,avv:typeof _$av!=="undefined"?(String(_$av).slice(0,30)):null};_$d5=_$av[_$oU[2]];window.__dbg426b={d5:typeof _$d5};');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[D6] 执行完成');
  } catch (e) {
    console.log('[D6] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[D6] 列号:', col, '错误点:', dynCode.slice(col - 60, col + 60));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[D6] dbg308:', q('typeof __dbg308!=="undefined"?JSON.stringify(__dbg308):null'));
  console.log('[D6] dbg308b:', q('typeof __dbg308b!=="undefined"?JSON.stringify(__dbg308b):null'));
  console.log('[D6] dbg426:', q('typeof __dbg426!=="undefined"?JSON.stringify(__dbg426):null'));
  console.log('[D6] dbg426b:', q('typeof __dbg426b!=="undefined"?JSON.stringify(__dbg426b):null'));
  process.exit(0);
})().catch(e => { console.error('[D6] FATAL:', e.message); process.exit(1); });
