/**
 * 236_scan_all_huffman.js
 *
 * 遍历 jsdom 数组陷阱所有数组（len 40-400），做 huffman 解码（直接 + xor keys2），
 * 找段头 3/2 的 basearr 结构
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
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
function looksLikeBasearr(dec) {
  if (dec.length < 100 || dec.length > 600) return false;
  if (dec[0] !== 3 && dec[0] !== 2) return false;
  // 解析段
  let p = 0, segs = 0;
  while (p < dec.length - 2 && segs < 20) {
    const h = dec[p];
    if (h > 15) return false;
    const l = dec[p + 1];
    if (p + 2 + l > dec.length + 2) return false;
    segs++;
    p += 2 + l;
  }
  return segs >= 3;
}

(async () => {
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // keys2（纯算法）
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));

  let hits = 0;
  for (const a of dedup) {
    if (a.length < 40 || a.length > 400) continue;
    for (const [mode, src] of [['raw', a], ['xorK2', a.map((v, i) => v ^ keys2[i % 16])]]) {
      const dec = numarrDecrypt(src);
      if (looksLikeBasearr(dec)) {
        console.log('★★★ [' + a.length + 'B] mode=' + mode + ' 解码=' + dec.length + 'B');
        console.log('  basearr 前 40:', dec.slice(0, 40).join(','));
        let p = 0, segs = [];
        while (p < dec.length - 2 && segs.length < 30) {
          const h = dec[p];
          if (h > 15) break;
          const l = dec[p + 1];
          segs.push([h, l, p]);
          p += 2 + l;
        }
        console.log('  段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
        fs.writeFileSync(path.join(OUT, 'basearr_found.json'), JSON.stringify({ mode, srcLen: a.length, basearr: dec }));
        hits++;
        if (hits >= 3) { console.log('命中数达上限'); process.exit(0); }
      }
    }
  }
  console.log('扫描完成 命中:', hits);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
