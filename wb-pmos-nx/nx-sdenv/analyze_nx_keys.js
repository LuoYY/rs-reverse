// 提取 nx 完整 keys 结构（验证 cd 解析需要）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const { fork } = require('child_process');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function forkAll(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_all.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 25000);
    child.on('message', (m) => { clearTimeout(timer); resolve(m); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
}

(async () => {
  console.log('=== nx 完整 keys 分析 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('nsd:', nsd, 'cd_len:', cd.length);

  const m = await forkAll(nsd, cd);
  if (!m || !m.keysByLen) { console.log('keys 提取失败'); process.exit(1); }
  console.log('evalErr:', m.evalErr || 'none');
  console.log('\n=== keys 按长度 ===');
  const lens = Object.keys(m.keysByLen).map(Number).sort((a, b) => a - b);
  for (const len of lens) {
    const info = m.keysByLen[len];
    const top = info.top.slice(0, 3).map(t => `[${t.data.slice(0, 6).join(',')}${t.data.length > 6 ? '...' : ''}](x${t.count})`).join(' ');
    console.log(`len=${len}: unique=${info.unique} top: ${top}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
