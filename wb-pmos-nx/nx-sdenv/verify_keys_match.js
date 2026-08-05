// 用同会话验证 Go 的 keys 与 sdenv 提取的 keys 一致
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const { fork } = require('child_process');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function forkKeys(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 25000);
    child.on('message', (m) => { clearTimeout(timer); resolve(m); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
}

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_nsd_cd.json', 'utf8'));
  console.log('nsd:', d.nsd);
  const m = await forkKeys(d.nsd, d.cd);
  if (!m || !m.keys2) { console.log('keys 提取失败'); process.exit(1); }
  console.log('sdenv keys2:', m.keys2.join(','));
  console.log('sdenv keys16:', m.keys16.join(','));
  console.log('sdenv keys17:', m.keys17.join(','));
  // Go 的 keys（从上次输出）
  const goKeys2 = [14,194,25,253,169,94,239,226,212,151,80,3,7,166,24,317,180,159,236,223,69,18,37,153,169,77,248,255,145,72,44,3,194,173,106,203,53,59,48,249,47,91,184,179,169,178,65,162];
  const goKeys16 = [215,90,92,114,190,161,210,59,55,192,204,2,209,95,17,173];
  const goKeys17 = [189,225,232,167,21,116,0,125,1,160,3,0,4,5,7,4];
  console.log('\nkeys16 一致:', goKeys16.join(',') === m.keys16.join(','));
  console.log('keys17 一致:', goKeys17.join(',') === m.keys17.join(','));
  console.log('keys2 一致:', goKeys2.join(',') === m.keys2.join(','));
  if (goKeys2.join(',') !== m.keys2.join(',')) {
    console.log('\nkeys2 差异对比:');
    for (let i = 0; i < 48; i++) {
      if (goKeys2[i] !== m.keys2[i]) console.log(`  @${i}: go=${goKeys2[i]} sdenv=${m.keys2[i]}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
