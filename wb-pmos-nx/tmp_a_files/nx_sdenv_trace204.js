// 追踪 op204 执行 + pc 序列（patch 后）
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

  // op204 追踪 + pc 序列
  dynCode = dynCode.split('_$jc===204){_$a2=window;}').join('_$jc===204){window.__op204c=(window.__op204c||0)+1;window.__op204pc=_$oL-1;_$a2=window;}');
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){_$jc=_$ib[_$oL++];window.__pos=window.__pos||[];window.__pos.push(_$oL-1);if(window.__pos.length>6000)window.__pos.shift();window.__w3n=(window.__w3n||0)+1;if(window.__w3n>200000)throw new Error("W3");if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[T4] 执行完成');
  } catch (e) {
    console.log('[T4] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[T4] 列号:', col, '错误点:', dynCode.slice(col - 80, col + 80));
    }
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[T4] op204 次数:', q('typeof __op204c!=="undefined"?__op204c:null'));
  console.log('[T4] op204 pc:', q('typeof __op204pc!=="undefined"?__op204pc:null'));
  const pos = q('typeof __pos!=="undefined"?__pos:null');
  if (Array.isArray(pos)) {
    const uniq = [];
    let prev = -1;
    for (const p of pos) { if (p !== prev) { uniq.push(p); prev = p; } }
    console.log('[T4] pc 序列(前100):', uniq.slice(0, 100).join(','));
    console.log('[T4] pc30:', uniq.includes(30), 'pc615:', uniq.includes(615));
  }
  process.exit(0);
})().catch(e => { console.error('[T4] FATAL:', e.message); process.exit(1); });
