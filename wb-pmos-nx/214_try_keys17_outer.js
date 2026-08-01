/**
 * 214_try_keys17_outer.js
 *
 * 假设 nx 外层加密用 keys17（而非 keys16）：
 * 'a' 前缀 256B 密文 + keys17 候选解密 → keys2 前缀匹配
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const KEYS2P = [165, 114, 155, 62, 19, 210, 122, 197];

function decodeWith(str, basestr) {
  const idxmap = {}; for (let i = 0; i < basestr.length; i++) idxmap[basestr[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(str.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]];
    if (c0 === undefined || c1 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4));
  } else if (rem === 3) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]];
    if (c0 === undefined || c1 === undefined || c2 === undefined) return null;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  }
  return bytes;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { nsd, pCookie } = trap;
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // 'a' 前缀 256B
  const bytes = decodeWith(pCookie.slice(1), B64);
  console.log('密文:', bytes.length, 'B 前 16:', bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // keys 候选：keys16 + 所有 16B 非 ASCII
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const kCands = [];
  const k16 = dedup.find(a => a.length === 16 && a.every((v, i) => v === K16[i]));
  if (k16) kCands.push(['keys16', k16]);
  dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12)
    .forEach((a, i) => kCands.push(['k17#' + i, a]));
  console.log('密钥候选:', kCands.length);

  const now = Math.floor(Date.now() / 1000);
  for (const [kname, key] of kCands) {
    let found = null;
    for (let t = now - 86400; t <= now + 86400 && !found; t++) {
      for (let ele = 1; ele <= 2 && !found; ele++) {
        try {
          const arr = numarrAddTime([...key], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 60) {
            for (let i = 0; i + 8 <= dec.length; i++) {
              if (dec.slice(i, i + 8).every((v, j) => v === KEYS2P[j])) { found = { t, ele, dec, pos: i }; break; }
            }
            if (!found && dec[4] === 2) found = found || { t, ele, dec, pos: -1, weak: true };
          }
        } catch (e) {}
      }
    }
    if (found) {
      console.log('[' + kname + '] ' + (found.pos >= 0 ? '★★★ keys2 命中 @' + found.pos : '仅 nextarr[0]==2'), 't=' + found.t, 'ele=' + found.ele);
      console.log('  dec 前 20:', found.dec.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
      if (found.pos >= 0) {
        fs.writeFileSync(path.join(OUT, 'jsdom_decrypted_' + nsd + '.json'), JSON.stringify({ nsd, key: kname, t: found.t, ele: found.ele, pos: found.pos, dec: found.dec, bytes }));
        console.log('  已保存');
      }
    } else {
      console.log('[' + kname + '] 解密失败');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
