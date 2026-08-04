// 提取 nx 完整 keys 列表（按 cd 结构顺序）并验证 bruteForceOffset 假设
// 目标：确定 nx 的 numKeys/gap/keys[0]/keys[1]/keys[2] 结构
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

// cd 解密（纯算法，同 keygen_pure.go）
function decryptCd(str) {
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  bs.split('').forEach((k, i) => { idxmap[k] = i; });
  const d = [
    (c) => idxmap[c] << 2, (c) => idxmap[c] >> 4,
    (c) => (idxmap[c] & 15) << 4, (c) => idxmap[c] >> 2,
    (c) => (idxmap[c] & 3) << 6, (c) => idxmap[c],
  ];
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
  console.log('=== nx keys 结构 + cd 结构分析 ===');
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

  // cd 解密前 40 字节
  const cdArr = decryptCd(cd);
  console.log('\ncdArr 前 40:', cdArr.slice(0, 40).join(','));
  // cd 结构：cdArr[0..1] = tasklen? cdArr[2] = numKeys?
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('task section end:', end, 'cdArr[end..end+20]:', cdArr.slice(end, end + 20).join(','));

  // 输出 keys 摘要供对照
  console.log('\n=== sdenv 提取的 keys（按长度）===');
  const lens = Object.keys(m.keysByLen).map(Number).sort((a, b) => a - b);
  for (const len of lens) {
    const info = m.keysByLen[len];
    const top = info.top.slice(0, 3).map(t => `[${t.data.join(',')}](x${t.count})`).join(' ');
    console.log(`len=${len} unique=${info.unique}: ${top}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
