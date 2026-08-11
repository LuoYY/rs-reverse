// try-catch 包裹 IIFE，捕获完整错误栈
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

  // IIFE 包裹 try-catch：_$c4/_$hF/_$dI 调用点都捕获
  // 在关键执行函数加 try-catch：_$c4 是引擎，_$hF 是主执行器
  // 直接给 IIFE 整体套 try
  const iifeEnd = dynCode.lastIndexOf('})($_ts.scj,$_ts.aebi);');
  if (iifeEnd >= 0) {
    dynCode = dynCode.slice(0, iifeEnd) + 'try{})($_ts.scj,$_ts.aebi);}catch(__e){window.__ERR={msg:String(__e),stack:__e.stack};throw __e;}' + dynCode.slice(iifeEnd + '})($_ts.scj,$_ts.aebi);'.length);
    console.log('[CT] IIFE try-catch 包裹');
  }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[CT] 执行完成');
  } catch (e) {
    console.log('[CT] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const err = q('typeof __ERR!=="undefined"?__ERR:null');
  if (err && typeof err === 'object') {
    console.log('[CT] 捕获错误:', err.msg);
    console.log('[CT] 栈:');
    (err.stack || '').split('\n').slice(0, 15).forEach(l => console.log('[CT]   ' + l.slice(0, 250)));
  }
  process.exit(0);
})().catch(e => { console.error('[CT] FATAL:', e.message); process.exit(1); });
