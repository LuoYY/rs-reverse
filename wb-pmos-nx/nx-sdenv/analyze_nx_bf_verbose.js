// bruteForce 详细诊断：每次 end + cdArr[end..end+12] + 各 numKeys 假设
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
  console.log('cdArr[end..end+16]:', cdArr.slice(end, end + 16).join(','));
  console.log('keys2:', m.keys2.join(','));
  console.log('keys16:', m.keys16.join(','));
  console.log('keys17:', m.keys17.join(','));

  // bruteForce 详细：对 numKeys 假设打印每步
  for (const nk of [45, 50, 51, 52, 46, 47, 48, 49, 53, 55]) {
    const o0 = cdArr[end] ^ nk;
    const o1 = cdArr[end + 1] ^ 0;
    const o2 = cdArr[end + 2] ^ 2;
    const o3 = cdArr[end + 3] ^ 54;
    const o4 = cdArr[end + 4] ^ 52;
    const o5 = cdArr[end + 5] ^ 0;
    const o6 = cdArr[end + 6] ^ 2;
    const o7 = cdArr[end + 7] ^ 54;
    // keys[1][1] = cdArr[end+8] ^ o0
    const k11 = cdArr[end + 8] ^ o0;
    // gap2 = (cdArr[end+9]^o1)<<8 | (cdArr[end+10]^o2)
    const g2 = (cdArr[end + 9] ^ o1) << 8 | (cdArr[end + 10] ^ o2);
    // keys0 实际值
    const k0 = [cdArr[end + 3] ^ o3, cdArr[end + 4] ^ o4];
    const k1 = [cdArr[end + 7] ^ o7, k11];
    console.log(`numKeys=${nk}: offset[0]=${o0} keys0=[${k0}] keys1=[${k1}] gap2=${g2}`);
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
