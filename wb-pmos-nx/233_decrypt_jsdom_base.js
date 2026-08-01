/**
 * 233_decrypt_jsdom_base.js
 *
 * 解密 jsdom basearrEncrypt（128B，16 倍数）：
 * encryptMode2(128B, keys17, 0) → xor keys2 → huffman → basearr 明文
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function numarrDecrypt(bytes) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (node && node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  // jsdom：keys2@11，[128][128B] 段
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const Npos = k2pos + 48;
  const N = nextarr[Npos];
  const baseEnc = nextarr.slice(Npos + 1, Npos + 1 + N);
  console.log('jsdom basearrEncrypt:', baseEnc.length, 'B');
  console.log('前 16:', baseEnc.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // keys17 候选
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const k17s = dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12);
  console.log('keys17 候选:', k17s.length);
  k17s.forEach((a, i) => console.log('  k17#' + i + ':', a.map(b => b.toString(16).padStart(2, '0')).join(' ')));

  for (const [ki, k17] of k17s.entries()) {
    for (const flag of [0, 1]) {
      try {
        const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
        const X = encryptMode2([...baseEnc], arr, flag);
        if (X.length < 40) continue;
        const enc = [];
        for (let i = 0; i < X.length; i++) enc.push(X[i] ^ keys2[i % 16]);
        const ba = numarrDecrypt(enc);
        if (ba.length > 100 && (ba[0] === 3 || ba[0] === 2)) {
          console.log('★★★ k17#' + ki, 'flag=' + flag, 'X=' + X.length, 'basearr=' + ba.length + 'B 首:', ba[0], ba[1]);
          console.log('  basearr 前 40:', ba.slice(0, 40).join(','));
          let p = 0, segs = [];
          while (p < ba.length - 2 && segs.length < 30) {
            const h = ba[p];
            if (h > 15) break;
            const l = ba[p + 1];
            segs.push([h, l, p]);
            p += 2 + l;
          }
          console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
          fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ k17, flag, basearr: ba, enc, X }));
        } else if (ba.length > 50) {
          console.log('k17#' + ki, 'flag=' + flag, 'X=' + X.length, '解码 ' + ba.length + 'B 首:', ba[0], ba[1]);
        }
      } catch (e) {}
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
