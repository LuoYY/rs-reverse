/**
 * 213_decrypt_with_prefix.js
 *
 * 决定性验证：jsdom cookie 前缀='a'（非'0'）
 * 去前缀 → 256B 密文 → jsdom keys16 解密 → 找纯算法 keys2（165,114,...）
 * 命中 → 外层结构 + base64url + runTime 全部确认
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

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
  // 余数：2 字符 → 1 字节，3 字符 → 2 字节
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
  const parser = require('@src/handler/parser');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { nsd, pCookie } = trap;
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // 纯算法 keys2 前缀（大[225] 位置 15 确认）
  const KEYS2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys16 = dedup.find(a => a.length === 16 && a.every((v, i) => v === [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173][i]));
  console.log('keys16:', keys16 ? keys16.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');

  // 各种前缀方案
  const variants = {
    'a前缀': pCookie.slice(1),
    '0前缀': pCookie.startsWith('0') ? pCookie.slice(1) : pCookie,
    '无前缀': pCookie,
    'a前缀(去0)': pCookie[0] === 'a' ? pCookie.slice(1) : pCookie,
  };

  const now = Math.floor(Date.now() / 1000);
  console.log('now:', now);

  for (const [vname, payload] of Object.entries(variants)) {
    const bytes = decodeWith(payload, B64);
    if (!bytes) { console.log('[' + vname + '] 解码失败'); continue; }
    console.log('\n[' + vname + '] payload ' + payload.length + ' 字符 → ' + bytes.length + ' B');
    console.log('  前 16:', bytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

    let found = null;
    for (let t = now - 86400; t <= now + 86400 && !found; t++) {
      for (let ele = 1; ele <= 2 && !found; ele++) {
        try {
          const arr = numarrAddTime([...keys16], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 60) {
            // 找纯算法 keys2 前缀
            for (let i = 0; i + 8 <= dec.length; i++) {
              if (dec[i] === KEYS2P[0] && dec[i + 1] === KEYS2P[1] && dec[i + 2] === KEYS2P[2] && dec[i + 3] === KEYS2P[3] && dec[i + 4] === KEYS2P[4] && dec[i + 5] === KEYS2P[5] && dec[i + 6] === KEYS2P[6] && dec[i + 7] === KEYS2P[7]) {
                found = { t, ele, dec, pos: i }; break;
              }
            }
            if (!found && dec[4] === 2) found = found || { t, ele, dec, pos: -1, weak: true };
          }
        } catch (e) {}
      }
    }
    if (found) {
      console.log('  ' + (found.pos >= 0 ? '★★★ keys2 前缀命中 @' + found.pos : '仅 nextarr[0]==2'), 't=' + found.t, new Date(found.t * 1000).toISOString(), 'ele=' + found.ele);
      const na = found.dec.slice(4);
      console.log('  nextarr 总长:', na.length);
      console.log('  nextarr 前 32:', na.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
      if (found.pos >= 0) {
        console.log('  nextarr[0]:', na[0]);
        console.log('  keys2 前:', na.slice(found.pos, found.pos + 8).join(','));
        fs.writeFileSync(path.join(OUT, 'jsdom_decrypted_' + nsd + '.json'), JSON.stringify({ nsd, basestr: 'base64url', prefix: vname, t: found.t, ele: found.ele, pos: found.pos, nextarr: na, keys16 }));
        console.log('  已保存 jsdom_decrypted_' + nsd + '.json');
      }
    } else {
      console.log('  解密失败');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
