// 反推 nx offset：遍历 numKeys，用 sdenv keys 对照验证
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
  console.log('=== nx offset 反推 v2 ===');
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

  // 遍历 numKeys 20-200，用 keys[0]=[54,52] 反推 offset，验证 keys[2] 是否 48 且与 sdenv keys2 匹配
  for (let nk = 20; nk <= 200; nk++) {
    // offset 计算（假设 keys[0]=[54,52], gap0=2）
    const o0 = cdArr[end] ^ nk;
    const o1 = cdArr[end + 1] ^ 0;
    const o2 = cdArr[end + 2] ^ 2;
    const o3 = cdArr[end + 3] ^ 54;
    const o4 = cdArr[end + 4] ^ 52;
    const o5 = cdArr[end + 5] ^ 0;
    const o6 = cdArr[end + 6] ^ 2;
    const o7 = cdArr[end + 7] ^ 54;
    const offset = [o0, o1, o2, o3, o4, o5, o6, o7];
    const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);

    // 验证基础结构
    const gap0 = ans[1] << 8 | ans[2];
    if (gap0 !== 2 || ans[3] !== 54 || ans[4] !== 52) continue;

    // 解析 keys
    let op = 1;
    const keys = [];
    let valid = true;
    for (let i = 0; i < nk; i++) {
      if (op + 1 >= ans.length) { valid = false; break; }
      const gap = ans[op] << 8 | ans[op + 1];
      op += 2;
      if (op + gap > ans.length) { valid = false; break; }
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
    if (!valid) continue;

    // 检查 keys[2] 与 sdenv keys2 匹配
    const k2 = keys[2] || [];
    const sK2 = m.keys2;
    const matchLen = k2.length === sK2.length;
    const matchPrefix = matchLen && k2.slice(0, 8).join(',') === sK2.slice(0, 8).join(',');
    const k16 = keys[16] || [], k17 = keys[17] || [];
    if (matchLen && matchPrefix) {
      console.log(`\n✅ numKeys=${nk}: keys[2] 与 sdenv 匹配!`);
      console.log('  keys[2] 前8:', k2.slice(0, 8).join(','));
      console.log('  sdenv keys2 前8:', sK2.slice(0, 8).join(','));
      console.log('  keys[16].len:', k16.length, 'keys[17].len:', k17.length);
      if (k16.length === 16) {
        console.log('  keys[16]:', k16.join(','));
        console.log('  对照 sdenv keys16:', m.keys16.join(','));
        console.log('  匹配:', k16.join(',') === m.keys16.join(','));
      }
      if (k17.length === 16) {
        console.log('  keys[17]:', k17.join(','));
        console.log('  对照 sdenv keys17:', m.keys17.join(','));
        console.log('  匹配:', k17.join(',') === m.keys17.join(','));
      }
      console.log('  offset:', offset.join(','));
    } else if (matchLen && !matchPrefix && k2.length === 48) {
      console.log(`numKeys=${nk}: keys[2].len=48 但前缀不匹配: [${k2.slice(0, 8).join(',')}] vs [${sK2.slice(0, 8).join(',')}]`);
    }
  }
  console.log('\n（遍历完成）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
