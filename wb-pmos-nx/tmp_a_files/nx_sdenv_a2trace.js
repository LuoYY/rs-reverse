// op204(opcode) 与 op227 执行追踪：_$a2 状态
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
  dynCode = dynCode.split('_$jc===372){debugger; !_$lj?_$oL+=2:0;}').join('_$jc===372){debugger;_$oL+=2;}');

  // opcode 204 和 227 handler 加追踪
  dynCode = dynCode.split('_$jc===204){_$a2=window;}').join('_$jc===204){window.__a2t=(window.__a2t||[]);window.__a2t.push("204 a2="+(typeof _$a2)+" pc="+(_$oL-1));_$a2=window;window.__a2t.push("204a2 set a2="+(typeof _$a2));}');
  dynCode = dynCode.split('_$jc===227)').join('_$jc===227)window.__a2t=window.__a2t||[];window.__a2t.push("227 a2="+(typeof _$a2)+" pc="+(_$oL-1));');
  // 如果 227 是 else（非精确匹配），改用 opcode 226 后
  if (dynCode.indexOf('_$jc===227)') < 0) {
    // opcode 227 是 else，插桩在 _$oU[88] 前
    dynCode = dynCode.split('_$$p=_$a2[_$oU[88]];').join('window.__a2t=window.__a2t||[];window.__a2t.push("227doc a2="+(typeof _$a2)+" pc="+(_$oL-1));_$$p=_$a2[_$oU[88]];');
    console.log('[A2] 227 else 插桩');
  }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 30000, filename: 'nx_dyn.js' });
    console.log('[A2] 执行完成');
  } catch (e) {
    console.log('[A2] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) console.log('[A2] 列号:', m[1]);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const t = q('typeof __a2t!=="undefined"?__a2t:null');
  console.log('[A2] 追踪:');
  if (Array.isArray(t)) console.log('[A2]   ' + t.join('\n[A2]   '));
  process.exit(0);
})().catch(e => { console.error('[A2] FATAL:', e.message); process.exit(1); });
