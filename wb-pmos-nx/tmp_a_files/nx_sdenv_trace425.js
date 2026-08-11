// 追踪 op425 是否执行 + pc 序列确认 pc225
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

  // op425 标记 + pc 序列
  dynCode = dynCode.split('_$jc===425){_$mD[18]=_$a2[_$b1[131]];}').join('_$jc===425){window.__op425c=(window.__op425c||0)+1;window.__op425pc=_$oL-1;_$mD[18]=_$a2[_$b1[131]];window.__mD18a=typeof _$mD[18];}');
  const w3Pattern = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj = 'while(1){_$jc=_$ib[_$oL++];window.__pos=window.__pos||[];window.__pos.push(_$oL-1);if(window.__pos.length>3000)window.__pos.shift();window.__w3n=(window.__w3n||0)+1;if(window.__w3n>200000)throw new Error("W3");if(_$jc<444){';
  dynCode = dynCode.split(w3Pattern).join(w3Inj);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };
  sandbox.globalThis.$_ts = sandbox.$_ts;
  sandbox.window.$_ts = sandbox.$_ts;

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[T6] 执行完成');
  } catch (e) { console.log('[T6] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[T6] op425 次数:', q('typeof __op425c!=="undefined"?__op425c:null'));
  console.log('[T6] op425 pc:', q('typeof __op425pc!=="undefined"?__op425pc:null'));
  console.log('[T6] mD18:', q('typeof __mD18a!=="undefined"?__mD18a:null'));
  const pos = q('typeof __pos!=="undefined"?__pos:null');
  if (Array.isArray(pos)) {
    const uniq = [];
    let prev = -1;
    for (const p of pos) { if (p !== prev) { uniq.push(p); prev = p; } }
    console.log('[T6] pc225:', uniq.includes(225), 'pc429:', uniq.includes(429));
    console.log('[T6] pc 序列(200-250):', uniq.filter(p => p >= 200 && p <= 250).join(','));
  }
  process.exit(0);
})().catch(e => { console.error('[T6] FATAL:', e.message); process.exit(1); });
