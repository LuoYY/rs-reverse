// ★ 决定性 v5：扩展 pos 搜索 + keys2/16/17 三重交叉验证
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
  console.log('=== nx offset v5（扩展搜索 + 三重验证）===');
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
  const k2 = m.keys2, k16 = m.keys16, k17 = m.keys17;
  console.log('k16:', k16.join(','));
  console.log('k17:', k17.join(','));
  console.log('k2 前8:', k2.slice(0, 8).join(','));

  // 遍历 pos_k2 0..600（keys[2] 起始），周期 8
  let found = 0;
  for (let pos = 0; pos <= 600; pos++) {
    if (pos + 48 > cdArr.length - end) break;
    const offset = new Array(8).fill(null);
    let consistent = true;
    for (let j = 0; j < 48; j++) {
      const idx = (pos + j) % 8;
      const val = cdArr[end + pos + j] ^ k2[j];
      if (offset[idx] === null) offset[idx] = val;
      else if (offset[idx] !== val) { consistent = false; break; }
    }
    if (!consistent || offset.includes(null)) continue;
    // 用 offset XOR 完整解析 keys
    const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
    // 验证 numKeys
    const numKeys = ans[0];
    if (numKeys < 1 || numKeys > 300) continue;
    // 用 step=2 解析所有 keys
    let op = 1;
    const keys = [];
    let valid = true;
    for (let i = 0; i < numKeys; i++) {
      if (op + 1 >= ans.length) { valid = false; break; }
      const gap = ans[op] << 8 | ans[op + 1];
      op += 2;
      if (gap < 0 || op + gap > ans.length) { valid = false; break; }
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
    if (!valid) continue;
    const kk2 = keys[2] || [];
    const ki16 = keys[16] || [];
    const ki17 = keys[17] || [];
    const m2 = kk2.length === 48 && kk2.join(',') === k2.join(',');
    if (!m2) continue;
    found++;
    const mm16 = ki16.length === 16 && ki16.join(',') === k16.join(',');
    const mm17 = ki17.length === 16 && ki17.join(',') === k17.join(',');
    console.log(`\n✅ pos_k2=${pos}: numKeys=${numKeys} offset=[${offset.join(',')}]`);
    console.log(`  keys.len=${keys.length} keys[16]匹配=${mm16} keys[17]匹配=${mm17}`);
    console.log('  keys[0]:', keys[0].join(','), 'keys[1]:', keys[1] ? keys[1].join(',') : '');
    if (mm16) console.log('  keys[16]:', ki16.join(','));
    if (mm17) console.log('  keys[17]:', ki17.join(','));
    if (mm16 && mm17) {
      console.log('\n★★★★★ 完美匹配！');
      fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ pos, numKeys, offset, keys }));
      process.exit(0);
    }
  }
  console.log(`\n遍历完成，keys[2] 匹配 ${found} 处`);
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
