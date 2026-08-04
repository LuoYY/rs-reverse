// ★ 决定性 v2：遍历 keys[2] 起始位置 pos 和 offset 循环长度，用 keys2 反推 offset
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
  console.log('=== nx offset 决定性 v2 ===');
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
  console.log('end:', end, 'cdArr len:', cdArr.length);
  console.log('cdArr[end..end+40]:', cdArr.slice(end, end + 40).join(','));

  const k2 = m.keys2;
  const k16 = m.keys16;
  const k17 = m.keys17;
  console.log('keys2 前16:', k2.slice(0, 16).join(','));

  // 遍历 pos（keys[2] 起始），offset 循环长度 8
  const found = [];
  for (let pos = 0; pos <= 80; pos++) {
    if (pos + 48 > cdArr.length - end) continue;
    // 反推 offset[0..7]
    const offset = new Array(8).fill(null);
    let consistent = true;
    for (let j = 0; j < 48; j++) {
      const idx = (pos + j) % 8;
      const val = cdArr[end + pos + j] ^ k2[j];
      if (offset[idx] === null) offset[idx] = val;
      else if (offset[idx] !== val) { consistent = false; break; }
    }
    if (!consistent || offset.includes(null)) continue;

    // 应用 offset 完整 XOR，解析 keys 结构
    const ans = cdArr.slice(end).map((b, i) => b ^ offset[i % 8]);
    // 尝试 step=2 解析
    let op = 1;
    const keys = [];
    const numKeys = ans[0];
    if (numKeys < 1 || numKeys > 300) continue;
    let valid = true;
    for (let i = 0; i < numKeys; i++) {
      if (op + 1 >= ans.length) { valid = false; break; }
      const gap = ans[op] << 8 | ans[op + 1];
      op += 2;
      if (gap < 0 || op + gap > ans.length) { valid = false; break; }
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
    if (!valid || keys.length === 0) continue;
    // 检查 keys[2] 是否 = k2
    const kk2 = keys[2] || [];
    const matchK2 = kk2.length === 48 && kk2.join(',') === k2.join(',');
    const ki16 = keys[16] || [];
    const ki17 = keys[17] || [];
    const match16 = ki16.length === 16 && ki16.join(',') === k16.join(',');
    const match17 = ki17.length === 16 && ki17.join(',') === k17.join(',');
    if (matchK2) {
      const score = (match16 ? 1 : 0) + (match17 ? 1 : 0);
      found.push({ pos, numKeys, offset, keys, match16, match17, score });
      console.log(`\npos=${pos}: numKeys=${numKeys} keys.len=${keys.length} keys[2]匹配=${matchK2} keys[16]=${match16} keys[17]=${match17}`);
      console.log('  offset:', offset.join(','));
      console.log('  keys[0]:', keys[0].join(','), 'keys[1]:', keys[1] ? keys[1].join(',') : '');
      console.log('  keys[16]:', ki16.join(','));
      console.log('  keys[17]:', ki17.join(','));
      if (match16 && match17) {
        console.log('\n★★★★★ 完美匹配！');
        fs.writeFileSync('/tmp/nx_offset_found.json', JSON.stringify({ pos, numKeys, offset, keys }));
        process.exit(0);
      }
    }
  }
  if (!found.length) {
    console.log('\n（keys[2] 在任何 pos 都未匹配——可能 offset 循环长度不是 8 或结构不同）');
  } else {
    console.log(`\n找到 ${found.length} 个 keys[2] 匹配，但 keys16/17 未完美匹配`);
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
