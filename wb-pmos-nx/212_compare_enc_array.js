/**
 * 212_compare_enc_array.js
 *
 * 决定性验证 basestr：
 * jsdom 数组陷阱抓到的外层加密输出（256B 高熵数组）vs cookie 解码字节
 * 若匹配 → basestr 顺序确定 + 外层结构确认（encryptMode1 输出含 IV）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const BASESTRS = {
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  b64std: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  b86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^'.slice(0, 64),
  cookieChars: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
  xj86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^'.slice(0, 64),
};

function decodeWith(str, basestr) {
  const payload = str.startsWith('0') ? str.slice(1) : str;
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(payload.length / 4); g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return bytes;
}

(async () => {
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { nsd, pCookie } = trap;
  console.log('nsd:', nsd, 'P cookie len:', pCookie.length);

  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // 1. 各 basestr 解码 cookie
  for (const [name, bs] of Object.entries(BASESTRS)) {
    const bytes = decodeWith(pCookie, bs);
    if (!bytes) { console.log('\n[' + name + '] 解码失败'); continue; }
    console.log('\n[' + name + '] 解码', bytes.length, 'B');
    console.log('  前 16:', bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  后 8 :', bytes.slice(-8).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // 2. 在数组陷阱里找匹配数组（长度一致 + 内容一致，容差 0）
    // 尝试不同偏移（可能有前缀/无前缀）
    for (let off = 0; off <= 4; off++) {
      const sub = bytes.slice(off);
      const matches = dedup.filter(a => a.length === sub.length && a.every((v, i) => v === sub[i]));
      if (matches.length > 0) {
        console.log('  ★★★ 数组陷阱匹配! 偏移=' + off + ' 长度=' + sub.length + ' 匹配数=' + matches.length);
      }
    }
    // 子序列匹配（数组陷阱的数组是 cookie bytes 的一部分）
    let bestMatch = null, bestLen = 0;
    for (const a of dedup) {
      if (a.length < 32) continue;
      // 检查 a 是否在 bytes 中作为连续子序列
      for (let i = 0; i + a.length <= bytes.length; i++) {
        let ok = true;
        for (let j = 0; j < a.length; j++) { if (bytes[i + j] !== a[j]) { ok = false; break; } }
        if (ok && a.length > bestLen) { bestLen = a.length; bestMatch = { arr: a, at: i }; break; }
      }
    }
    if (bestMatch) console.log('  子序列匹配 len=' + bestLen + ' @bytes[' + bestMatch.at + ']');
  }

  // 3. dump 数组陷阱里 240-270 长度的数组
  console.log('\n=== 240-270 长度数组 ===');
  const mids = dedup.filter(a => a.length >= 240 && a.length <= 270);
  mids.forEach(a => {
    const asciiRatio = a.filter(v => v >= 32 && v <= 126).length / a.length;
    console.log('  [' + a.length + '] ascii=' + asciiRatio.toFixed(2), '前 8:', a.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  // 4. dump 含纯算法 keys2 前缀的数组
  const keys2p = [165, 114, 155, 62, 19, 210, 122, 197];
  const k2m = dedup.filter(a => a.length >= 48 && a.slice(0, 8).every((v, i) => v === keys2p[i]));
  console.log('\n=== 以纯算法 keys2 开头的数组 ===');
  k2m.forEach(a => console.log('  [' + a.length + ']:', a.slice(0, 16).join(',')));

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
