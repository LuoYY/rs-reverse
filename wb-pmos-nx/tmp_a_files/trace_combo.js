// patch 302 后追踪 w3 死循环点
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

  dynCode = dynCode.split('_$jc===302){_$oL+=-9;}').join('_$jc===302){0;}');

  // pc:opcode 序列追踪
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){_$jc=_$ib[_$oL++];window.__pos=window.__pos||[];window.__pos.push((_$oL-1)+":"+_$jc);if(window.__pos.length>8000)window.__pos.shift();window.__w3n=(window.__w3n||0)+1;if(window.__w3n>200000)throw new Error("W3");if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
    console.log('[TC] 执行完成');
  } catch (e) { console.log('[TC] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const pos = q('typeof __pos!=="undefined"?__pos:null');
  if (Array.isArray(pos)) {
    const uniq = [];
    let prev = null;
    for (const p of pos) { if (p !== prev) { uniq.push(p); prev = p; } }
    console.log('[TC] 唯一序列:');
    console.log('[TC]   ' + uniq.slice(0, 150).join(' '));
    console.log('[TC] 长度:', uniq.length);
    const pcs = uniq.map(s => s.split(':')[0]);
    console.log('[TC] pc30:', pcs.includes('30'), 'pc84:', pcs.includes('84'));
  }
  process.exit(0);
})().catch(e => { console.error('[TC] FATAL:', e.message); process.exit(1); });
