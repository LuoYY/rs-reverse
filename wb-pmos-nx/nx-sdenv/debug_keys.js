// 用真实 nsd/cd 测试 keys 提取稳定性
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const { fork } = require('child_process');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function forkKeys(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    let err = '';
    child.stderr.on('data', d => err += d.toString());
    const timer = setTimeout(() => { child.kill(); resolve({ ok: false, timeout: true }); }, 20000);
    child.on('message', (m) => { clearTimeout(timer); resolve({ ...m, stderr: err.substring(0, 200) }); });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false }); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
}

(async () => {
  console.log('[1] sdenv 加载挑战页...');
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const { window } = dom;
  const nsd = window.$_ts ? window.$_ts.nsd : null;
  const cd = window.$_ts ? String(window.$_ts.cd) : null;
  console.log('nsd:', nsd, 'cd_len:', cd ? cd.length : 0);
  if (!nsd || !cd) { console.log('无 nsd/cd'); process.exit(1); }

  console.log('[2] fork keys 提取 x3...');
  for (let i = 0; i < 3; i++) {
    const m = await forkKeys(nsd, cd);
    console.log(`[${i + 1}] ok=${m.ok} keys17=${m.keys17 ? 'Y' : 'N'} keys2=${m.keys2 ? 'Y' : 'N'} counts=${JSON.stringify(m.counts || {})} err=${(m.error || m.timeout || '').substring(0, 80)}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
