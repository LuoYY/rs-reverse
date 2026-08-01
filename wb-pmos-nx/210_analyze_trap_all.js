/**
 * 210_analyze_trap_all.js
 *
 * 分析 trap_all_*.json：
 *  1. keys16/17/2（数组陷阱抓的，校准纯算法）
 *  2. 64 字符数组（basestr 候选）
 *  3. basearr 明文（大数组）
 *  4. 用 jsdom keys16 + 遍历 t 解密 jsdom P cookie（多 basestr）→ keys2 强校验
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
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { nsd, pCookie } = trap;
  console.log('nsd:', nsd, 'P cookie len:', pCookie.length, '前 22:', pCookie.substring(0, 22));

  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  console.log('总数组:', all.length, '去重:', dedup.length);

  // 1. keys16（纯算法 K16 匹配）
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const k16s = dedup.filter(a => a.length === 16 && a.every((v, i) => v === K16[i]));
  console.log('\nkeys16(匹配K16):', k16s.length);
  const keys16 = k16s[0] || null;

  // 2. keys2（48B，非 ASCII 候选）——取第一个像 keys 的
  const k48s = dedup.filter(a => a.length === 48);
  console.log('48B 数组:', k48s.length, '非ASCII:', k48s.filter(a => a.filter(b => b >= 32 && b <= 126).length < 20).length);
  const keys2 = k48s.find(a => a.filter(b => b >= 32 && b <= 126).length < 20) || k48s[0];

  // 3. keys17（16B 非 ASCII 且非 K16）
  const k17s = dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12);
  console.log('keys17 候选:', k17s.length);
  k17s.slice(0, 5).forEach(a => console.log('  keys17:', a.map(b => b.toString(16).padStart(2, '0')).join(' ')));
  const keys17 = k17s[0] || null;

  // 4. 64 字符数组（basestr）
  const k64 = dedup.filter(a => a.length === 64 && a.every(v => v >= 32 && v <= 126));
  console.log('\n64 字符数组:', k64.length);
  k64.forEach(a => console.log('  64: [' + a.map(b => String.fromCharCode(b)).join('') + ']'));

  // 5. basearr 明文：大数组，且 numarrEncrypt 后是合理长度
  const bigs = dedup.filter(a => a.length >= 100 && a.length <= 500);
  console.log('\n大数组:', bigs.length);
  // 打印 200-400 的候选
  bigs.filter(a => a.length >= 200 && a.length <= 400).slice(0, 8).forEach(a => {
    console.log('  大[' + a.length + ']:', a.slice(0, 30).join(','));
    try {
      const enc = numarrEncrypt(a);
      console.log('    numarrEncrypt →', enc.length, 'B');
    } catch (e) {}
  });

  // 6. 解密 P cookie（用 jsdom keys16 + 遍历 t）
  console.log('\n=== 解密 P cookie ===');
  if (keys16 && pCookie) {
    const now = Math.floor(Date.now() / 1000);
    for (const [name, bs] of Object.entries(BASESTRS)) {
      const bytes = decodeWith(pCookie, bs);
      if (!bytes) { console.log('[' + name + '] 解码失败'); continue; }
      let found = null;
      for (let t = now - 7200; t <= now + 7200 && !found; t++) {
        for (let ele = 1; ele <= 2 && !found; ele++) {
          try {
            const arr = numarrAddTime([...keys16], t, ele / 256)[0];
            const dec = encryptMode2([...bytes], arr, 1);
            if (dec.length > 60) {
              if (keys2 && dec.slice(12, 60).every((v, i) => v === keys2[i])) { found = { t, ele, dec, strong: true }; break; }
              if (dec[4] === 2 && !found) found = { t, ele, dec, strong: false };
            }
          } catch (e) {}
        }
      }
      if (found) {
        console.log('[' + name + '] 解密候选 t=' + found.t, 'ele=' + found.ele, '强校验=' + (found.strong ? 'YES' : 'NO(仅 nextarr[0]==2)'));
        if (found.strong) {
          console.log('  dec 前 16:', found.dec.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
          const na = found.dec.slice(4);
          console.log('  nextarr 前 24:', na.slice(0, 24).map(b => b.toString(16).padStart(2, '0')).join(' '));
          console.log('  nextarr[0]:', na[0], 'keys2 位置:', na.findIndex((_, i) => i + 48 <= na.length && na.slice(i, i + 48).every((v, j) => v === keys2[j])));
          console.log('  nextarr 总长:', na.length);
          fs.writeFileSync(path.join(OUT, 'jsdom_decrypted_' + nsd + '.json'), JSON.stringify({ nsd, basestr: name, t: found.t, ele: found.ele, nextarr: na, keys16, keys2, keys17 }));
        }
      } else {
        console.log('[' + name + '] 解密失败');
      }
    }
  } else {
    console.log('缺 keys16 或 pCookie');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
