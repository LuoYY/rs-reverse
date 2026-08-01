/**
 * 234_inner_key_brute.js
 *
 * jsdom basearrEncrypt（128B）内层解密全面暴力：
 * keys(纯算法+jsdom) × t(0/固定/真实) × flag(0/1) × xor keys2 前后
 * → huffman 解码 → 段头 3 校验
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
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const N = nextarr[k2pos + 48];
  const baseEnc = nextarr.slice(k2pos + 49, k2pos + 49 + N);
  console.log('jsdom basearrEncrypt:', baseEnc.length, 'B');

  // 密钥候选
  const kCands = [];
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  kCands.push(['K16', K16]);
  const der = JSON.parse(fs.readFileSync(path.join(OUT, 'nx_keys_derived.json')));
  der.keys.forEach((k, i) => { if (Array.isArray(k) && k.length >= 16 && k.length <= 64) kCands.push(['keys' + i, k.slice(0, 16)]); });
  dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12)
    .forEach((a, i) => kCands.push(['jsd' + i, a]));

  // t 候选
  const now = Math.floor(Date.now() / 1000);
  const tCands = [0, 1785580000, now, now - 3600, now + 3600, 1785416991];

  console.log('密钥候选:', kCands.length, 't 候选:', tCands.length);
  let hits = 0;
  for (const [kname, key] of kCands) {
    for (const t of tCands) {
      for (const flag of [0, 1]) {
        try {
          const arr = numarrAddTime([...key], t, 1 / 256)[0];
          const X = encryptMode2([...baseEnc], arr, flag);
          if (X.length < 40) continue;
          // 两种 xor 方式
          for (const mode of ['xorK2', 'raw']) {
            const enc = mode === 'xorK2' ? X.map((v, i) => v ^ keys2[i % 16]) : X;
            const ba = numarrDecrypt(enc);
            if (ba.length > 100 && (ba[0] === 3 || ba[0] === 2)) {
              console.log('★★★ ' + kname, 't=' + t, 'flag=' + flag, 'mode=' + mode, 'basearr=' + ba.length + 'B 首:', ba[0], ba[1]);
              let p = 0, segs = [];
              while (p < ba.length - 2 && segs.length < 30) {
                const h = ba[p];
                if (h > 15) break;
                const l = ba[p + 1];
                segs.push([h, l, p]);
                p += 2 + l;
              }
              console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
              fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ kname, t, flag, mode, basearr: ba }));
              hits++;
            }
          }
        } catch (e) {}
      }
    }
  }
  console.log('命中数:', hits);
  if (!hits) {
    // 直接 huffman 解码 basearrEncrypt（无内层解密）
    const ba = numarrDecrypt(baseEnc);
    console.log('直接 huffman 解码:', ba.length, 'B 首:', ba[0], ba[1]);
    const ba2 = numarrDecrypt(baseEnc.map((v, i) => v ^ keys2[i % 16]));
    console.log('xor keys2 后解码:', ba2.length, 'B 首:', ba2[0], ba2[1]);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
