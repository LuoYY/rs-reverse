// ★ 决定性 v7：用 keys2 反推 offset 的自洽周期（不预设 8）
// 对每个 pos，找最小周期 L 使 keys2 XOR cdArr 自洽
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
  console.log('=== nx offset v7（周期自洽搜索）===');
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
  const k2 = m.keys2;

  // 对每个 pos 和 L，计算自洽度（48 字节中 offset 重复位置一致的数量）
  let best = [];
  for (let pos = 0; pos <= 400; pos++) {
    if (pos + 48 > cdArr.length - end) break;
    for (const L of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24]) {
      // 检查周期自洽：offset[(pos+j)%L] 对所有 j 一致
      const off = new Map();
      let selfConsistent = true;
      for (let j = 0; j < 48; j++) {
        const idx = (pos + j) % L;
        const val = cdArr[end + pos + j] ^ k2[j];
        if (off.has(idx)) { if (off.get(idx) !== val) { selfConsistent = false; break; } }
        else off.set(idx, val);
      }
      if (selfConsistent && off.size === L) {
        best.push({ pos, L, match: 48 });
      }
    }
  }
  console.log('自洽 (pos, L):', JSON.stringify(best.slice(0, 20)));

  // 对每个自洽候选，验证 keys16/17
  const k16 = m.keys16, k17 = m.keys17;
  for (const { pos, L } of best.slice(0, 10)) {
    const off = new Map();
    for (let j = 0; j < 48; j++) off.set((pos + j) % L, cdArr[end + pos + j] ^ k2[j]);
    const ans = cdArr.slice(end).map((b, i) => b ^ (off.get(i % L) || 0));
    // 尝试解析 keys（numKeys 开头）
    const numKeys = ans[0];
    let op = 1;
    const keys = [];
    let valid = numKeys > 0 && numKeys < 300;
    for (let i = 0; i < numKeys && valid; i++) {
      const gap = ans[op] << 8 | ans[op + 1];
      op += 2;
      if (gap < 0 || op + gap > ans.length) { valid = false; break; }
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
    if (!valid) continue;
    const ki16 = keys[16] || [], ki17 = keys[17] || [];
    console.log(`\npos=${pos} L=${L} numKeys=${numKeys}: keys[16]=${ki16.length === 16 && ki16.join(',') === k16.join(',')} keys[17]=${ki17.length === 16 && ki17.join(',') === k17.join(',')}`);
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
