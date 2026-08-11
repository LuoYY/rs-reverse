// 在 _$c4 函数入口包裹 try-catch，捕获引擎内部错误完整栈
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

  // 找 _$c4 定义，包裹 try-catch
  const c4Pat = 'function _$c4(';
  let c4i = dynCode.indexOf(c4Pat);
  console.log('[C2] _$c4 @' + c4i);
  if (c4i >= 0) {
    // 函数体开头注入 try
    const bodyStart = dynCode.indexOf('{', c4i) + 1;
    dynCode = dynCode.slice(0, bodyStart) + 'try{' + dynCode.slice(bodyStart);
    // 函数体结尾（匹配 }）注入 catch
    // 找到函数结束：从 bodyStart 平衡括号
    let depth = 0, end = -1;
    for (let i = bodyStart; i < dynCode.length; i++) {
      if (dynCode[i] === '{') depth++;
      else if (dynCode[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end >= 0) {
      dynCode = dynCode.slice(0, end) + '}catch(__c4e){window.__C4ERR={msg:String(__c4e),stack:__c4e&&__c4e.stack};throw __c4e;}' + dynCode.slice(end);
      console.log('[C2] _$c4 try-catch 包裹 @' + end);
    }
  }

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[C2] 执行完成');
  } catch (e) {
    console.log('[C2] 错误:', e.message);
  }
  const q = (e) => { try { return vm.runInContext(e, sandbox); } catch (e2) { return 'ERR'; } };
  const err = q('typeof __C4ERR!=="undefined"?__C4ERR:null');
  if (err && typeof err === 'object') {
    console.log('[C2] 捕获错误:', err.msg);
    console.log('[C2] 栈:');
    (err.stack || '').split('\n').slice(0, 15).forEach(l => console.log('[C2]   ' + l.slice(0, 250)));
  } else {
    console.log('[C2] 无捕获', err);
  }
  process.exit(0);
})().catch(e => { console.error('[C2] FATAL:', e.message); process.exit(1); });
