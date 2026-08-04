// 反推 nx 的 keys.length 和 offset（从 cdArr + 已知 keys 常量）
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
  console.log('=== nx offset 反推 ===');
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
  console.log('end:', end, 'cdArr[end..end+20]:', cdArr.slice(end, end + 20).join(','));

  // 假设 keys[0]=[54,52], keys[1]=[54,52], keys[2].len=48
  // offset[i] = cdArr[end+i] ^ ans[i]
  // ans[0]=numKeys, ans[1..2]=gap0, ans[3..4]=keys[0], ans[5..6]=gap1, ans[7..8]=keys[1]
  // 试 numKeys = 各种值
  for (const nk of [45, 40, 41, 42, 43, 44, 46, 47, 48, 50, 60]) {
    // offset[0] = cdArr[end] ^ nk
    const o0 = cdArr[end] ^ nk;
    const o1 = cdArr[end + 1] ^ 0;
    const o2 = cdArr[end + 2] ^ 2;
    const o3 = cdArr[end + 3] ^ 54;
    const o4 = cdArr[end + 4] ^ 52;
    const o5 = cdArr[end + 5] ^ 0;
    const o6 = cdArr[end + 6] ^ 2;
    const o7 = cdArr[end + 7] ^ 54;
    const offset = [o0, o1, o2, o3, o4, o5, o6, o7];
    // XOR ans
    const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
    // 验证 ans[1..2] = gap0 = 2 (keys[0] 长度 2)
    const gap0 = ans[1] << 8 | ans[2];
    // 验证 ans[3..4] = [54,52]
    const k0 = [ans[3], ans[4]];
    const k0match = k0[0] === 54 && k0[1] === 52;
    // 验证 ans[5..6] = gap1
    const gap1 = ans[5] << 8 | ans[6];
    console.log(`numKeys=${nk}: gap0=${gap0} keys[0]=[${k0}] match=${k0match} gap1=${gap1} keys[1]=[${ans[7]},${ans[8]}]`);
    if (k0match && gap0 === 2 && ans[7] === 54 && ans[8] === 52) {
      console.log('  ✅ 找到! offset=', offset.join(','));
      // 继续解析 keys
      let op = 1;
      const keys = [];
      for (let i = 0; i < nk; i++) {
        const gap = ans[op] << 8 | ans[op + 1];
        op += 2;
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      console.log('  keys[2].len:', keys[2].length, 'keys[16].len:', keys[16] ? keys[16].length : 'x', 'keys[17].len:', keys[17] ? keys[17].length : 'x');
      console.log('  keys[2] 前8:', keys[2].slice(0, 8).join(','));
      console.log('  keys[16]:', keys[16].join(','));
      console.log('  keys[17]:', keys[17].join(','));
      console.log('  对照 sdenv keys16:', m.keys16.join(','));
      console.log('  对照 sdenv keys17:', m.keys17.join(','));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
