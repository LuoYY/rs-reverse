/**
 * 223_brute_inner_key.js
 *
 * 暴力遍历所有纯算法 keys[0..50] 作为内层密钥解密 basearrEncrypt
 * 解密 → xor keys2 → huffman 解码 → 段头 3 校验
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
  console.log('basearrEncrypt:', baseEnc.length, 'B');

  // 纯算法 keys（从 nx_keys_derived.json）
  const der = JSON.parse(fs.readFileSync(path.join(OUT, 'nx_keys_derived.json')));
  const keys = der.keys;
  console.log('纯算法 keys 数:', keys.length);
  // 修正 keys17（用 jsdom 抓的正确值）
  const k17Fixed = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  keys[17] = k17Fixed;
  keys[17] = k17Fixed;

  const runTime = 1785416991;
  const cands = keys.map((k, i) => ['keys[' + i + ']', k]).filter(([, k]) => Array.isArray(k) && k.length >= 16);

  for (const [kname, key] of cands) {
    for (let ele = 1; ele <= 2; ele++) {
      try {
        const arr = numarrAddTime([...key], runTime, ele / 256)[0];
        const X = encryptMode2([...baseEnc], arr, 0);
        if (X.length < 40) continue;
        const enc = [];
        for (let i = 0; i < X.length; i++) enc.push(X[i] ^ keys2[i % 16]);
        const dec = numarrDecrypt(enc);
        if (dec.length > 60 && (dec[0] === 3 || dec[0] === 2 || dec[0] === 1)) {
          console.log('★★★ ' + kname, 'ele=' + ele, 'X=' + X.length, '解码=' + dec.length + 'B 首字节=' + dec[0]);
          console.log('  basearr 前 40:', dec.slice(0, 40).join(','));
          let p = 0, segs = [];
          while (p < dec.length - 2 && segs.length < 30) {
            const h = dec[p];
            if (h > 15) break;
            const l = dec[p + 1];
            segs.push([h, l, p]);
            p += 2 + l;
          }
          console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1]).join(' '));
          fs.writeFileSync(path.join(OUT, 'basearr_plain_final.json'), JSON.stringify({ kname, key, runTime, ele, basearr: dec }));
          process.exit(0);
        }
      } catch (e) {}
    }
  }
  console.log('无命中');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
