// ★ 决定性：用 sdenv keys2（48B 已知）反推 nx 的完整 offset
// keys[2] 在 ans 中的位置由 gap 链决定，而 offset 是 8 字节循环：
// keys2[j] = cdArr[end+pos+j] ^ offset[(pos+j)%8]
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
  console.log('=== nx offset 决定性反推（keys2 已知）===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  const m = await forkKeys(nsd, cd);
  if (!m || !m.keys2 || !m.keys16 || !m.keys17) { console.log('keys 提取失败'); process.exit(1); }
  console.log('sdenv keys2:', m.keys2.join(','));
  console.log('sdenv keys16:', m.keys16.join(','));
  console.log('sdenv keys17:', m.keys17.join(','));

  const cdArr = decryptCd(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  console.log('end:', end);
  console.log('cdArr[end..end+20]:', cdArr.slice(end, end + 20).join(','));

  // 假设 gap 链：keys[0] 长度 g0，keys[1] 长度 g1，都在 1-8 范围
  // keys[2] 起始位置 pos = 1 + 2(gap0) + g0 + 2(gap1) + g1 + 2(gap2)
  // 遍历 g0, g1 (1..8)，用 keys2 反推 offset 并验证 keys16/17
  const k2 = m.keys2;
  const k16 = m.keys16;
  const k17 = m.keys17;
  for (let g0 = 1; g0 <= 8; g0++) {
    for (let g1 = 1; g1 <= 8; g1++) {
      // gap0 = g0, gap1 = g1, gap2 = 48（keys[2] 长度）
      // ans 位置：ans[0]=numKeys, ans[1..2]=gap0, ans[3..3+g0]=keys0, ans[3+g0..4+g0]=gap1, ans[5+g0..5+g0+g1]=keys1, ans[6+g0+g1..7+g0+g1]=gap2=48, ans[8+g0+g1..]=keys2
      const keys2Start = 8 + g0 + g1;
      if (keys2Start + 48 > cdArr.length - end) continue;
      // 反推 offset：offset[(keys2Start+j)%8] = cdArr[end+keys2Start+j] ^ k2[j]
      const offset = new Array(8).fill(null);
      let consistent = true;
      for (let j = 0; j < 48; j++) {
        const idx = (keys2Start + j) % 8;
        const val = cdArr[end + keys2Start + j] ^ k2[j];
        if (offset[idx] === null) offset[idx] = val;
        else if (offset[idx] !== val) { consistent = false; break; }
      }
      if (!consistent || offset.includes(null)) continue;
      // 验证 keys16/17：keys16 位置 = keys2Start + 48 + 2 + ... 需要继续 gap 链
      // 先验证 ans[0]=numKeys 与 offset[0] 一致（offset[0] 应使 cdArr[end]^offset[0] 合理）
      // 验证 keys0：ans[3..3+g0] ^ offset
      const ans0 = cdArr[end] ^ offset[0];
      // keys0 应含 [54,52]（若 g0=2）
      let keys0 = [];
      for (let i = 0; i < g0; i++) keys0.push(cdArr[end + 3 + i] ^ offset[(3 + i) % 8]);
      if (g0 === 2 && !(keys0[0] === 54 && keys0[1] === 52)) continue;
      // 验证 keys1（g1=2 时应为 [54,52]？不一定，跳过严格验证）
      // 输出候选
      console.log(`\n候选: g0=${g0} g1=${g1} numKeys=${ans0} offset=[${offset.join(',')}]`);
      console.log('  keys0:', keys0.join(','));
      // 完整解析 keys
      const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
      // 解析所有 keys
      let op = 1;
      const keys = [];
      const numKeys = ans[0];
      let valid = true;
      for (let i = 0; i < numKeys; i++) {
        if (op + 1 >= ans.length) { valid = false; break; }
        const gap = ans[op] << 8 | ans[op + 1];
        op += 2;
        if (op + gap > ans.length) { valid = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!valid || keys.length === 0) { console.log('  keys 解析失败'); continue; }
      const ki16 = keys[16] || [];
      const ki17 = keys[17] || [];
      console.log(`  keys.len=${keys.length} keys[2].len=${(keys[2] || []).length} keys[16].len=${ki16.length} keys[17].len=${ki17.length}`);
      const match16 = ki16.length === 16 && ki16.join(',') === k16.join(',');
      const match17 = ki17.length === 16 && ki17.join(',') === k17.join(',');
      console.log(`  keys[16] 匹配 sdenv: ${match16}  keys[17] 匹配 sdenv: ${match17}`);
      if (match16 && match17) {
        console.log('\n★★★★★ 完美匹配！');
        fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ g0, g1, numKeys, offset, keys }));
        console.log('已保存 /tmp/nx_offset_found.json');
        process.exit(0);
      }
    }
  }
  console.log('\n（未找到完美匹配）');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
