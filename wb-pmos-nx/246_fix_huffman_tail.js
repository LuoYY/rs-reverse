/**
 * 246_fix_huffman_tail.js
 *
 * 修复 huffman 解码尾部：截断 basearr 尾部字符，round-trip 匹配 Ereal
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
function numarrEncryptBytes(numarr, pad) {
  const tree = getTree();
  const map = {};
  (function walk(node, bits) { if (node.idx !== undefined) { map[node.idx] = bits; return; } walk(node.first, bits + '0'); walk(node.second, bits + '1'); })(tree, '');
  let bitstr = '';
  for (const b of numarr) bitstr += map[b] || '';
  const out = [];
  let one = 0, two = 0;
  for (const c of bitstr) { one = (one << 1) | +c; two++; if (two === 8) { out.push(one); one = 0; two = 0; } }
  if (two > 0) out.push(one << (8 - two) | (pad >> two));
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
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);

  const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
  const Xreal = encryptMode2([...target], arr, 0);
  const Ereal = Xreal.slice();
  for (let i = 0; i < 16 && i < Ereal.length; i++) Ereal[i] ^= keys2[i];

  const ba = numarrDecrypt(Ereal);
  console.log('解码 basearr:', ba.length, 'B');

  // 试截断尾部 0-12 字符
  let found = false;
  for (let cut = 0; cut <= 12; cut++) {
    const sub = ba.slice(0, ba.length - cut);
    const enc = numarrEncryptBytes(sub, 0x68);
    const ok = enc.length === Ereal.length && enc.every((v, i) => v === Ereal[i]);
    if (ok) {
      console.log('★★★ 截断 ' + cut + ' 字符后 round-trip YES! basearr=' + sub.length + 'B');
      console.log('basearr 前 30:', sub.slice(0, 30).join(','));
      // 段结构
      let p = 0, segs = [];
      while (p < sub.length - 2 && segs.length < 30) {
        const h = sub[p];
        if (h > 15) break;
        const l = sub[p + 1];
        segs.push([h, l, p]);
        p += 2 + l;
      }
      console.log('段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
      fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ cut, basearr: sub }));
      found = true;
      break;
    }
  }
  if (!found) console.log('无截断匹配');

  // 打印差异最小的截断
  let best = null, bestDiff = 999;
  for (let cut = 0; cut <= 12; cut++) {
    const sub = ba.slice(0, ba.length - cut);
    const enc = numarrEncryptBytes(sub, 0x68);
    let diff = 0, dpos = -1;
    for (let i = 0; i < Math.min(enc.length, Ereal.length); i++) if (enc[i] !== Ereal[i]) { diff++; if (dpos < 0) dpos = i; }
    if (diff < bestDiff) { bestDiff = diff; best = { cut, encLen: enc.length, dpos }; }
  }
  console.log('最佳截断:', JSON.stringify(best), 'Ereal len:', Ereal.length);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
