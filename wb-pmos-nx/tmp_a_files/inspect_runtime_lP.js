// buildEnv 中运行时打印 _$lP 结构与 _$oL 初始值
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

  // 在 while(3) 开头注入运行时 dump：_$lP 结构 + _$la 值 + _$ib 前 30 元素
  const w3Pattern = 'var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];';
  const w3Inj = w3Pattern + 'window.__dbg={lP0len:_$lP[0].length,lP1len:Array.isArray(_$lP[1])?_$lP[1].length:typeof _$lP[1],la:_$la,ibHead:_$ib.slice(0,25)};';
  if (dynCode.indexOf(w3Pattern) >= 0) {
    dynCode = dynCode.split(w3Pattern).join(w3Inj);
    console.log('[IR] w3 dump 注入 OK');
  } else { console.log('[IR] ✗ 未找到'); process.exit(1); }

  // while(3) 限次抛错（避免死循环）
  const w3Loop = 'while(1){_$jc=_$ib[_$oL++];if(_$jc<444){';
  const w3Inj2 = 'while(1){window.__w3n=(window.__w3n||0)+1;if(window.__w3n>300000)throw new Error("W3");_$jc=_$ib[_$oL++];if(_$jc<444){';
  dynCode = dynCode.split(w3Loop).join(w3Inj2);

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 15000, filename: 'nx_dyn.js' });
  } catch (e) { console.log('[IR] 错误:', e.message); }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  console.log('[IR] lP0len:', q('window.__dbg.lP0len'));
  console.log('[IR] lP1len:', q('window.__dbg.lP1len'));
  console.log('[IR] la:', q('window.__dbg.la'));
  console.log('[IR] ibHead:', q('JSON.stringify(window.__dbg.ibHead)'));
  console.log('[IR] aebi0[0:25]:', JSON.stringify(ts.aebi[0].slice(0, 25)));
  process.exit(0);
})().catch(e => { console.error('[IR] FATAL:', e.message); process.exit(1); });
