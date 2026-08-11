// 跳过 opcode 339（_$lj=!_$c7[...] → _$lj=0）
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

  // opcode 339：_$lj= !_$c7[_$oP[75]] → _$lj=0
  dynCode = dynCode.split('_$lj= !_$c7[_$oP[75]];').join('_$lj=0;');
  console.log('[C3] op339 patch');

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  const t0 = Date.now();
  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[C3] 执行完成，耗时 ' + (Date.now() - t0) + 'ms');
  } catch (e) {
    console.log('[C3] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[C3] 列号:', col);
      console.log('[C3] 错误点:', dynCode.slice(col - 100, col + 100));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[C3] cookie:', q('typeof document!=="undefined"&&document.cookie?document.cookie.length:null'));
  console.log('[C3] ktF:', q('typeof __ktF!=="undefined"?__ktF.length:null'));
  process.exit(0);
})().catch(e => { console.error('[C3] FATAL:', e.message); process.exit(1); });
