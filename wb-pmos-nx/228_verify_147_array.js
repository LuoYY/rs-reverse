/**
 * 228_verify_147_array.js
 *
 * 验证 147B 高熵数组是否为 numarrEncrypt(basearr) 或 xor(keys2) 后
 * huffman 解码 → 段头结构
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

(async () => {
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];

  // keys2（纯算法）
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));

  // 147B 数组
  const arr147 = dedup.find(a => a.length === 147);
  if (!arr147) { console.log('无 147B 数组'); process.exit(0); }
  console.log('147B 数组:', arr147.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 方案1：直接 huffman 解码（未 xor）
  const d1 = numarrDecrypt(arr147);
  console.log('\n[直接解码] ' + d1.length + 'B 前 20:', d1.slice(0, 20).join(','));

  // 方案2：xor keys2 后解码
  const x = [];
  for (let i = 0; i < arr147.length; i++) x.push(arr147[i] ^ keys2[i % 16]);
  const d2 = numarrDecrypt(x);
  console.log('[xor keys2] ' + d2.length + 'B 前 20:', d2.slice(0, 20).join(','));

  for (const [name, dec] of [['直接', d1], ['xor', d2]]) {
    if (dec.length > 50) {
      let p = 0, segs = [];
      while (p < dec.length - 2 && segs.length < 30) {
        const h = dec[p];
        if (h > 15) break;
        const l = dec[p + 1];
        segs.push([h, l, p]);
        p += 2 + l;
      }
      console.log('[' + name + '] 段结构:', segs.map(s => '[' + s[0] + ']l' + s[1]).join(' '));
      console.log('[' + name + '] 首字节:', dec[0], '第二:', dec[1]);
      if (dec[0] === 3 || dec[0] === 2) {
        console.log('  ★★★ ' + name + ' 命中 basearr 结构!');
        fs.writeFileSync(path.join(OUT, 'basearr_from_147.json'), JSON.stringify({ scheme: name, basearr: dec }));
      }
    }
  }

  // 也找 100-160B 高熵数组全部
  console.log('\n=== 100-160B 高熵数组 ===');
  dedup.filter(a => a.length >= 100 && a.length <= 160 && a.filter(v => v >= 32 && v <= 126).length < a.length * 0.4)
    .forEach(a => {
      const d = numarrDecrypt(a);
      console.log('  [' + a.length + '] 前8:', a.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '), '解码' + d.length + 'B 首:', d[0]);
    });
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
