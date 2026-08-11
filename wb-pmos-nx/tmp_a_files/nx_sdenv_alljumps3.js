// 精确定位 concat 错误（打印更多上下文 + 栈）
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

  // 同样 patch
  dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
  dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });
  dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
    const n = parseInt(m.match(/-?\d+/)[0]);
    return n < 0 ? '0;' : m;
  });

  const env = buildEnv({ nsd: ts.nsd, cd: ts.cd }, { target: B + '/', ua: UA, patchDyn: false, debugLog: false });
  const sandbox = env.sandbox;
  sandbox.$_ts = { nsd: ts.nsd, cd: ts.cd, lcd: ts.lcd, cp: ts.cp, jf: ts.jf, aebi: ts.aebi, scj: ts.scj };

  try {
    vm.runInContext(dynCode, sandbox, { timeout: 60000, filename: 'nx_dyn.js' });
    console.log('[A3] 执行完成');
  } catch (e) {
    console.log('[A3] 错误:', e.message);
    const m = e.stack && e.stack.match(/nx_dyn\.js:1:(\d+)/);
    if (m) {
      const col = +m[1];
      console.log('[A3] 列号:', col);
      console.log('[A3] 错误点 300 chars:');
      console.log('[A3]   ' + dynCode.slice(col - 200, col + 100));
    }
    // 完整栈
    const lines = (e.stack || '').split('\n').slice(1, 8);
    console.log('[A3] 栈:');
    lines.forEach(l => console.log('[A3]   ' + l.slice(0, 200)));
  }
  process.exit(0);
})().catch(e => { console.error('[A3] FATAL:', e.message); process.exit(1); });
