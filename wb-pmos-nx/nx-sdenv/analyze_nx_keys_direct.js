// 检查 keys2/16/17 是否直接出现在 cdArr（无 XOR）
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
// 查找子数组位置
function findSub(arr, sub, from) {
  for (let i = from; i + sub.length <= arr.length; i++) {
    let ok = true;
    for (let j = 0; j < sub.length; j++) { if (arr[i + j] !== sub[j]) { ok = false; break; } }
    if (ok) return i;
  }
  return -1;
}

(async () => {
  console.log('=== keys 直接搜索（无 XOR）===');
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
  console.log('end:', end, 'len:', cdArr.length);

  // 搜索 keys2 前 8 字节
  const k2p8 = m.keys2.slice(0, 8);
  const k16p8 = m.keys16.slice(0, 8);
  const k17p8 = m.keys17.slice(0, 8);
  for (const [name, pat] of [['keys2', k2p8], ['keys16', k16p8], ['keys17', k17p8]]) {
    let pos = findSub(cdArr, pat, 0);
    let n = 0;
    while (pos >= 0 && n < 5) {
      console.log(`${name} 前8字节 直接出现在 cdArr @ ${pos} (end+${pos - end})`);
      pos = findSub(cdArr, pat, pos + 1);
      n++;
    }
    if (n === 0) console.log(`${name} 前8字节 未直接出现`);
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
