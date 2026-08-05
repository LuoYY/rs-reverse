// bruteForce v3：遍历 numKeys 和 keys[1] 候选（[54,52]/[53,57]/[51,55]），找 keys[2]=48B 匹配
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
  console.log('end:', end, 'cdArr[end..end+14]:', cdArr.slice(end, end + 14).join(','));
  const k2 = m.keys2, k16 = m.keys16, k17 = m.keys17;

  const k1Candidates = [[54, 52], [53, 57], [51, 55]];
  for (let nk = 30; nk <= 70; nk++) {
    for (const k1 of k1Candidates) {
      // 基础 offset（keys0=[54,52], gap0=2）
      const o0 = cdArr[end] ^ nk;
      const o1 = cdArr[end + 1] ^ 0;
      const o2 = cdArr[end + 2] ^ 2;
      const o3 = cdArr[end + 3] ^ 54;
      const o4 = cdArr[end + 4] ^ 52;
      const o5 = cdArr[end + 5] ^ 0;
      const o6 = cdArr[end + 6] ^ 2;
      const o7 = cdArr[end + 7] ^ k1[0];
      // keys1[1] = cdArr[end+8] ^ o0
      const k11 = cdArr[end + 8] ^ o0;
      if (k11 !== k1[1]) continue;
      const offset = [o0, o1, o2, o3, o4, o5, o6, o7];
      const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
      // 解析 keys
      let op = 1;
      const keys = [];
      let valid = true;
      for (let i = 0; i < nk; i++) {
        if (op + 1 >= ans.length) { valid = false; break; }
        const gap = ans[op] << 8 | ans[op + 1];
        op += 2;
        if (gap < 0 || op + gap > ans.length) { valid = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!valid) continue;
      const kk2 = keys[2] || [];
      const ki16 = keys[16] || [], ki17 = keys[17] || [];
      const mm2 = kk2.length === 48 && kk2.join(',') === k2.join(',');
      const mm16 = ki16.length === 16 && ki16.join(',') === k16.join(',');
      const mm17 = ki17.length === 16 && ki17.join(',') === k17.join(',');
      if (mm2) {
        console.log(`\n✅ numKeys=${nk} keys1=[${k1}]: keys[2] 匹配! keys[16]=${mm16} keys[17]=${mm17}`);
        console.log('  offset:', offset.join(','));
        console.log('  keys.len:', keys.length);
        if (mm16 && mm17) {
          console.log('★★★★★ 完美匹配！');
          fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ nk, k1, offset, keys }));
          process.exit(0);
        }
      }
    }
  }
  console.log('\n（遍历完成）');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
