// 分析 nx cd 头部结构：numKeys/gap 模式
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
function decryptCd(str) {
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  bs.split('').forEach((k, i) => { idxmap[k] = i; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3];
    if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4));
    if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
    if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]);
  }
  return ans;
}

(async () => {
  console.log('=== nx cd 头部结构 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  const m = await forkKeys(nsd, cd);
  if (!m || !m.keys2) { console.log('keys 提取失败'); process.exit(1); }

  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('end:', end);
  console.log('cdArr[0..5]:', cdArr.slice(0, 6).join(','));
  console.log('cdArr[end..end+30]:', cdArr.slice(end, end + 30).join(','));
  console.log('keys2:', m.keys2.join(','));

  // 假设 offset[0]=0 简单看 cdArr[end]（无 XOR 时 = numKeys）
  console.log('\n=== 尝试: 用 sdenv keys2 前8字节直接反推 offset[0..7]（假设 keys[2] 在某 pos）===');
  // 更直接：暴力搜索 keys2 在 XOR 前的"差分模式"
  // keys2[j] ^ keys2[j+1] 与 cdArr 的差分（offset 差分抵消）
  const diffK = [];
  for (let j = 0; j < 47; j++) diffK.push(k2j => k2j[j] ^ k2j[j + 1]);
  const k2 = m.keys2;
  const k2d = [];
  for (let j = 0; j < 47; j++) k2d.push(k2[j] ^ k2[j + 1]);
  // cdArr[end+pos+j] ^ cdArr[end+pos+j+1] 应 = k2d[j]（若 offset[pos+j%L]^offset[pos+j+1%L] 小）
  // 对 L=8: offset[j]^offset[j+1] 是固定模式
  const best = [];
  for (let pos = 0; pos <= 100; pos++) {
    if (pos + 48 > cdArr.length - end) break;
    let match = 0;
    for (let j = 0; j < 47; j++) {
      if ((cdArr[end + pos + j] ^ cdArr[end + pos + j + 1]) === k2d[j]) match++;
    }
    best.push({ pos, match });
  }
  best.sort((a, b) => b.match - a.match);
  console.log('差分匹配 TOP5:', JSON.stringify(best.slice(0, 5)));
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
