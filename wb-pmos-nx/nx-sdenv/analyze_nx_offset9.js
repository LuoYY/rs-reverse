// ★ 决定性 v6：代数反推 offset（假设 gap0=gap1=2, keys0/keys1 从 sdenv 提取）
// keys[2]@pos11, keys16@pos?, keys17@pos?
// 用 keys16/keys17 的真实值反推它们的位置（在 ans 中搜索）
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
  console.log('=== nx offset v6（代数反推）===');
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
  const k2 = m.keys2, k16 = m.keys16, k17 = m.keys17;

  // 假设 offset 8 字节循环，keys 结构 [numKeys][gap0][keys0][gap1][keys1][gap2][keys2]...
  // keys0 在 ans[3..4], keys1 在 ans[7..8], keys2 在 ans[11..58]
  // 反推 offset：offset[i] = cdArr[end+i] ^ ans[i]
  // 对 numKeys 遍历，用 keys2 匹配最紧
  for (let numKeys = 20; numKeys <= 80; numKeys++) {
    const offset = new Array(8).fill(null);
    // 用已知位置反推 offset 候选（keys0@3-4, keys1@7-8, keys2@11-58）
    // keys0 未知，先假设 [54,52]（xj 一致）
    // 但更稳：用 keys2@11-58 反推 offset[3..7, 0..1]
    let ok = true;
    for (let j = 0; j < 48; j++) {
      const ai = 11 + j; // ans 中 keys2 位置
      const idx = ai % 8;
      const val = cdArr[end + ai] ^ k2[j];
      if (offset[idx] === null) offset[idx] = val;
      else if (offset[idx] !== val) { ok = false; break; }
    }
    if (!ok || offset.includes(null)) continue;
    // 验证 ans[0] = numKeys
    const a0 = cdArr[end] ^ offset[0];
    if (a0 !== numKeys) continue;
    // 验证 keys0@3-4 和 keys1@7-8（应含 54,52 或别的）
    const k0 = [cdArr[end + 3] ^ offset[3], cdArr[end + 4] ^ offset[4]];
    const k1 = [cdArr[end + 7] ^ offset[7], cdArr[end + 8] ^ offset[0]];
    const g0 = (cdArr[end + 1] ^ offset[1]) << 8 | (cdArr[end + 2] ^ offset[2]);
    const g1 = (cdArr[end + 5] ^ offset[5]) << 8 | (cdArr[end + 6] ^ offset[6]);
    console.log(`numKeys=${numKeys}: g0=${g0} keys0=[${k0}] g1=${g1} keys1=[${k1}] offset=[${offset.join(',')}]`);
    if (g0 === 2 && g1 === 2) {
      // 完整解析验证 keys16/17
      const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
      let op = 1;
      const keys = [];
      let valid = true;
      for (let i = 0; i < numKeys; i++) {
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
      console.log(`  keys.len=${keys.length} keys[16]=${mm16} keys[17]=${mm17}`);
      if (mm16) console.log('  keys[16]:', ki16.join(','));
      if (mm17) console.log('  keys[17]:', ki17.join(','));
      if (mm16 && mm17) {
        console.log('\n★★★★★ 完美匹配！');
        fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ numKeys, offset, keys }));
        process.exit(0);
      }
    }
  }
  console.log('\n（遍历完成）');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
