/**
 * 215_scan_keys2_plain.js
 *
 * 扫描 cookie 解码字节（多 basestr + 多前缀方案）里是否直接含 keys2 明文
 * 判断：nextarr 是否未加密 / 外层加密结构
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

const BASESTRS = {
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  b64std: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  b86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^'.slice(0, 64),
  cookieChars: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
  reverse64: '_zyxwvutsrqponmlkjihgfedcbaZYXWVUTSRQPONMLKJIHGFEDCBA9876543210-',
};

function decodeWith(str, basestr) {
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined || c1 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined || c1 === undefined || c2 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { pCookie } = trap;

  // keys2 前缀候选（纯算法 keys2 前 8 字节）
  const KEYS2_PREFIX = [165, 114, 155, 62, 19, 210, 122, 197];
  // 也试 jsdom 48B keys2 候选
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const k2cands = dedup.filter(a => a.length === 48);
  console.log('48B 数组候选:', k2cands.length);
  k2cands.slice(0, 11).forEach(a => console.log('  48B:', a.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')));

  const prefixes = { 'a': pCookie.slice(1), '0': pCookie[0] === '0' ? pCookie.slice(1) : pCookie, none: pCookie };

  for (const [pname, payload] of Object.entries(prefixes)) {
    for (const [bname, bs] of Object.entries(BASESTRS)) {
      const bytes = decodeWith(payload, bs);
      if (!bytes) continue;
      // 扫描 keys2 前缀（所有候选）
      for (const k2 of k2cands) {
        if (k2.length < 8) continue;
        for (let i = 0; i + 8 <= bytes.length; i++) {
          if (bytes.slice(i, i + 8).every((v, j) => v === k2[j])) {
            console.log('★★★ 明文 keys2 命中! 前缀=' + pname, 'basestr=' + bname, '@' + i, 'len=' + bytes.length);
            console.log('  keys2 前缀:', k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
            console.log('  解码前 32:', bytes.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
          }
        }
      }
      // 结构检查：前 16B IV ints
      if (bname === 'base64url') {
        const iv = bytes.slice(0, 16);
        console.log('[' + pname + '] IV ints:', [0, 4, 8, 12].map(o => ((iv[o] << 24) | (iv[o + 1] << 16) | (iv[o + 2] << 8) | iv[o + 3]) >>> 0).join(','));
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
