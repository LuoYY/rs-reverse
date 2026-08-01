/**
 * 211_bruteforce_outer.js
 *
 * 从 trap_all 拿 jsdom 真实 keys，暴力外层解密 P cookie：
 *  - 多 basestr 解码
 *  - 密钥候选：keys16 / keys17 / 两者都试
 *  - 宽时间窗口（±86400）
 *  - 校验：解密结果任意位置含 keys2（48B 滑动窗口）
 *  若命中 → 外层加密结构 + basestr 确定！
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

function findKeys2(dec, keys2) {
  if (!keys2 || keys2.length === 0) return -1;
  const maxStart = dec.length - keys2.length;
  for (let i = 0; i <= maxStart; i++) {
    let ok = true;
    for (let j = 0; j < keys2.length; j++) { if (dec[i + j] !== keys2[j]) { ok = false; break; } }
    if (ok) return i;
  }
  return -1;
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
  console.log('nsd:', nsd, 'P cookie len:', pCookie.length, '前 22:', pCookie.substring(0, 22));

  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // keys2（48B 非 ASCII）
  const keys2 = dedup.find(a => a.length === 48 && a.filter(b => b >= 32 && b <= 126).length < 20) || null;
  console.log('keys2:', keys2 ? keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');

  // keys16（K16 匹配）
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const keys16 = dedup.find(a => a.length === 16 && a.every((v, i) => v === K16[i])) || null;
  console.log('keys16:', keys16 ? keys16.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');

  // keys17（16B 非 ASCII 非 K16）——用全部候选
  const k17s = dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12);
  console.log('keys17 候选:', k17s.length);
  k17s.forEach(a => console.log('  k17:', a.map(b => b.toString(16).padStart(2, '0')).join(' ')));

  const keyCandidates = [];
  if (keys16) keyCandidates.push(['keys16', keys16]);
  k17s.forEach((a, i) => keyCandidates.push(['keys17#' + i, a]));

  const now = Math.floor(Date.now() / 1000);
  console.log('now:', now, new Date(now * 1000).toISOString());

  for (const [name, bs] of Object.entries(BASESTRS)) {
    const bytes = decodeWith(pCookie, bs);
    if (!bytes) { console.log('\n[' + name + '] 解码失败'); continue; }
    console.log('\n[' + name + '] 解码', bytes.length, 'B');
    for (const [kname, key] of keyCandidates) {
      let found = null;
      for (let t = now - 86400; t <= now + 86400 && !found; t++) {
        for (let ele = 1; ele <= 2 && !found; ele++) {
          try {
            const arr = numarrAddTime([...key], t, ele / 256)[0];
            const dec = encryptMode2([...bytes], arr, 1);
            if (dec.length > 60) {
              const pos = findKeys2(dec, keys2);
              if (pos >= 0) { found = { t, ele, dec, pos }; break; }
              if (dec[4] === 2 && !found) found = { t, ele, dec, pos: -1, weak: true };
            }
          } catch (e) {}
        }
      }
      if (found) {
        if (found.pos >= 0) {
          console.log('  ★★★ [' + kname + '] keys2 命中 @' + found.pos, 't=' + found.t, new Date(found.t * 1000).toISOString(), 'ele=' + found.ele);
          console.log('  dec 前 20:', found.dec.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
          const na = found.dec.slice(4);
          console.log('  nextarr 总长:', na.length, '前 12:', na.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
          fs.writeFileSync(path.join(OUT, 'jsdom_decrypted_' + nsd + '.json'), JSON.stringify({ nsd, basestr: name, key: kname, t: found.t, ele: found.ele, pos: found.pos, nextarr: na, keys2, keys16, k17s }));
        } else if (found.weak) {
          console.log('  [' + kname + '] 仅 nextarr[0]==2（无 keys2 匹配）t=' + found.t);
        }
      } else {
        console.log('  [' + kname + '] 解密失败');
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
