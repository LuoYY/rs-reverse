/**
 * 218_exact_match.js
 *
 * 精确验证：外层加密明文 = 大[225]，密文 = cookie 解码 256B
 * 遍历密钥(keys16/k17) + t → 解密 → 全等对比大[225]
 * 命中 → 外层密钥 + runTime + basestr 全确认！
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const BASESTRS = {
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  b86: 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^'.slice(0, 64),
  b64std: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  cookieChars: '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
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
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const { pCookie } = trap;
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // 明文 = 大[225]（外层加密输入）
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  console.log('明文(大225):', plain ? plain.slice(0, 16).join(',') + '... len=' + plain.length : '无');

  // 密钥候选
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const kCands = [];
  const k16 = dedup.find(a => a.length === 16 && a.every((v, i) => v === K16[i]));
  if (k16) kCands.push(['keys16', k16]);
  dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12)
    .forEach((a, i) => kCands.push(['k17#' + i, a]));

  const now = Math.floor(Date.now() / 1000);
  console.log('now:', now);

  for (const [pname, payload] of Object.entries({ a_prefix: pCookie.slice(1), raw: pCookie })) {
    for (const [bname, bs] of Object.entries(BASESTRS)) {
      const C = decodeWith(payload, bs);
      if (!C || C.length !== 256) { if (C) console.log('[' + pname + '/' + bname + '] 解码 ' + C.length + 'B（非256）'); continue; }
      console.log('\n[' + pname + '/' + bname + '] C=' + C.length + 'B IV前8:', C.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      for (const [kname, key] of kCands) {
        let found = null;
        for (let t = now - 172800; t <= now + 172800 && !found; t++) {
          for (let ele = 1; ele <= 3 && !found; ele++) {
            try {
              const arr = numarrAddTime([...key], t, ele / 256)[0];
              const dec = encryptMode2([...C], arr, 1);
              if (dec.length === plain.length && dec.every((v, i) => v === plain[i])) {
                found = { t, ele };
              }
            } catch (e) {}
          }
        }
        if (found) {
          console.log('  ★★★ [' + kname + '] 全等匹配! t=' + found.t, new Date(found.t * 1000).toISOString(), 'ele=' + found.ele);
          fs.writeFileSync(path.join(OUT, 'outer_confirm.json'), JSON.stringify({ kname: kname.split('#')[0], t: found.t, ele: found.ele, basestr: bname, prefix: pname }));
          process.exit(0);
        } else {
          console.log('  [' + kname + '] 无匹配');
        }
      }
    }
  }
  console.log('\n全部失败');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
