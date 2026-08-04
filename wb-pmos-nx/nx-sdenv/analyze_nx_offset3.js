// 从 sdenv 提取的完整 keys 反推 offset（用 keys[0..5] 已知值）
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
  console.log('=== nx offset 反推 v3（完整 keys 对照）===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  const m = await forkAll(nsd, cd);
  if (!m || !m.keysByLen) { console.log('keys 提取失败'); process.exit(1); }

  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('end:', end);
  console.log('cdArr[end..end+30]:', cdArr.slice(end, end + 30).join(','));

  // sdenv 的 keys（按长度）：keys[0]=len2, keys[1]=len2?, keys[2]=len48, keys[16]=len16, keys[17]=len16
  // 尝试：numKeys=45, keys[0]=[54,52]（len2 top）, keys[1]=len2 top2
  // 反推 offset：offset[i] = cdArr[end+i] ^ ans[i]
  // 但 ans 未知（XOR 后才是 keys）...

  // 方法：遍历 numKeys，用 keys[0]=[54,52] 定位 offset[0..4]，然后验证后续 keys 长度链
  const len2Top = m.keysByLen[2].top;
  console.log('\nlen=2 的 top 数组:', len2Top.map(t => `[${t.data}]`).join(' '));
  const len48 = m.keysByLen[48];
  console.log('len=48 top:', JSON.stringify(len48 ? len48.top[0].data.slice(0, 8) : 'none'));
  const len16 = m.keysByLen[16].top;
  console.log('len=16 top:', len16.map(t => `[${t.data.slice(0, 4)}...]`).join(' '));

  // 假设 keys[0] = len2 top1 = [54,52]，反推 offset
  for (let nk = 30; nk <= 60; nk++) {
    const o0 = cdArr[end] ^ nk;
    const o1 = cdArr[end + 1] ^ 0;
    const o2 = cdArr[end + 2] ^ 2;
    const o3 = cdArr[end + 3] ^ 54;
    const o4 = cdArr[end + 4] ^ 52;
    // offset[5..7] 未确定（gap1/keys[1]），先试 keys[1]=[54,52]
    for (const k1 of [[54, 52], [51, 56], [54, 52]]) {
      const o5 = cdArr[end + 5] ^ 0;
      const o6 = cdArr[end + 6] ^ 2;
      const o7 = cdArr[end + 7] ^ k1[0];
      const o8 = cdArr[end + 8] ^ k1[1]; // 这是 offset[0] 循环
      // 检查 o8 是否 = o0（offset 8 字节循环）
      if (o8 !== o0) continue;
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
        if (op + gap > ans.length) { valid = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!valid) continue;
      const k2 = keys[2] || [];
      const sK2 = len48 ? len48.top[0].data : [];
      const match = k2.length === 48 && k2.slice(0, 8).join(',') === sK2.slice(0, 8).join(',');
      if (match) {
        console.log(`\n✅ numKeys=${nk} keys[1]=[${k1}]：keys[2] 匹配 sdenv!`);
        console.log('  offset:', offset.join(','));
        console.log('  keys[0]:', keys[0].join(','));
        console.log('  keys[1]:', keys[1].join(','));
        console.log('  keys[2] 前8:', k2.slice(0, 8).join(','));
        console.log('  keys[16].len:', (keys[16] || []).length, 'keys[17].len:', (keys[17] || []).length);
        fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ nk, offset, keys }));
        console.log('  已保存 /tmp/nx_offset_found.json');
        process.exit(0);
      }
    }
  }
  console.log('\n未找到匹配');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
