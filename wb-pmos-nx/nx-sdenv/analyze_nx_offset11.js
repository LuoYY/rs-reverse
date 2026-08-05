// ★ 决定性 v8：对每个 numKeys，用 genKeysFromCd 完整解析，找 keys2=48 且 keys16/17 匹配
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
  const k2 = m.keys2, k16 = m.keys16, k17 = m.keys17;

  // 对每个 numKeys 1-80：用 keys0=[54,52] gap0=2 反推 offset[0..4]，然后枚举 offset[5..7]（256^3 太大），
  // 但 offset[5..7] 影响 keys1/gap1/keys2 的起点。用 keys2 匹配来解。
  // 更稳：offset[0]=cdArr[end]^numKeys。若 keys0=[54,52] 对，offset[3..4] 确定。
  // 枚举 numKeys + keys1[0]（54/53/51）+ gap1（2/4/8），验证 keys1[1] 和 keys2 起点。
  for (let nk = 30; nk <= 70; nk++) {
    const o0 = cdArr[end] ^ nk;
    const o3 = cdArr[end + 3] ^ 54;
    const o4 = cdArr[end + 4] ^ 52;
    // 尝试 keys[1] 位置：gap0=2, keys0=2 字节, gap1=2, keys1=2 字节 → keys2 在 pos=11
    // 但 gap2 从 ans 读。先假设 keys2 起点 pos=11（keys0/1 都是 2 字节）
    // 用 keys2 反推 offset[5..7,0..1]
    const pos2 = 11;
    const offset = new Array(8).fill(null);
    offset[3] = o3; offset[4] = o4; offset[0] = o0;
    let consistent = true;
    for (let j = 0; j < 48; j++) {
      const idx = (pos2 + j) % 8;
      const val = cdArr[end + pos2 + j] ^ k2[j];
      if (offset[idx] === null) offset[idx] = val;
      else if (offset[idx] !== val) { consistent = false; break; }
    }
    if (!consistent || offset.includes(null)) continue;
    // 验证 ans 结构（numKeys/gap）
    const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
    if (ans[0] !== nk) continue;
    // 验证 keys0/keys1
    const k0 = [ans[3], ans[4]];
    if (k0[0] !== 54 || k0[1] !== 52) continue;
    const g1 = ans[5] << 8 | ans[6];
    const k1 = [ans[7], ans[8]];
    // 打印候选
    console.log(`numKeys=${nk}: offset=[${offset.join(',')}] keys0=[${k0}] g1=${g1} keys1=[${k1}]`);
    // 完整解析
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
    const ki16 = keys[16] || [], ki17 = keys[17] || [];
    const mm16 = ki16.length === 16 && ki16.join(',') === k16.join(',');
    const mm17 = ki17.length === 16 && ki17.join(',') === k17.join(',');
    if (mm16) console.log('  keys[16] 匹配!');
    if (mm17) console.log('  keys[17] 匹配!');
    if (mm16 && mm17) {
      console.log('\n★★★★★ 完美匹配！');
      fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ nk, offset, keys }));
      process.exit(0);
    }
  }
  console.log('\n（遍历完成）');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
