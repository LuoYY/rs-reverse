// 详细对比 cd 解析 keys2 与 sdenv keys2 的差异模式
const fs = require('fs');
// 同会话：从 /tmp/nx_nsd_cd.json（Go 用的会话）
// 需要 sdenv 提取该会话的 keys2
const { jsdomFromUrl } = require('sdenv');
const { fork } = require('child_process');
const path = require('path');
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
  const m = await forkKeys(d.nsd, d.cd);
  if (!m || !m.keys2) { console.log('keys 提取失败'); process.exit(1); }
  // Go 的 keys2（317 版）
  const goK2 = [14,194,25,253,169,94,239,226,212,151,80,3,7,166,24,317,180,159,236,223,69,18,37,153,169,77,248,255,145,72,44,3,194,173,106,203,53,59,48,249,47,91,184,179,169,178,65,162];
  const svK2 = m.keys2;
  console.log('cd keys2:', goK2.join(','));
  console.log('sdenv keys2:', svK2.join(','));
  console.log('\n差异 (cd, sdenv, cd-sdenv, cd&255):');
  for (let i = 0; i < 48; i++) {
    if (goK2[i] !== svK2[i]) {
      console.log(`  @${i}: cd=${goK2[i]} sdenv=${svK2[i]} 差=${goK2[i] - svK2[i]} cd&255=${goK2[i] & 255}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
