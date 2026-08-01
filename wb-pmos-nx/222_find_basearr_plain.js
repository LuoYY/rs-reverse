/**
 * 222_find_basearr_plain.js
 *
 * 在数组陷阱里直接搜 basearr 明文（numarrJoin 结构，首字节 3）+ numarrEncrypt 输出
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

// huffman 反向解码
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

  // 1. 首字节 3 或 2 的大数组（numarrJoin 候选）
  console.log('=== 首字节 3/2 的大数组（numarrJoin 结构候选）===');
  const joinCands = dedup.filter(a => a.length >= 80 && a.length <= 400 && (a[0] === 3 || a[0] === 2));
  joinCands.forEach(a => {
    const asciiRatio = a.filter(v => v >= 32 && v <= 126).length / a.length;
    console.log('  [' + a.length + '] 头=', a[0], 'ascii=' + asciiRatio.toFixed(2), '前 20:', a.slice(0, 20).join(','));
  });

  // 2. 高熵 100-180B 数组（numarrEncrypt 输出候选）
  console.log('\n=== 高熵 100-180B（numarrEncrypt 输出候选）===');
  const hiCands = dedup.filter(a => a.length >= 100 && a.length <= 180 && a.filter(v => v >= 32 && v <= 126).length < a.length * 0.3);
  hiCands.slice(0, 15).forEach(a => {
    console.log('  [' + a.length + '] 前 12:', a.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  // 3. 对高熵候选做 huffman 解码验证
  console.log('\n=== huffman 解码验证 ===');
  for (const a of hiCands) {
    const dec = numarrDecrypt(a);
    if (dec.length > 50 && dec.length < 500) {
      const segs = [];
      let p = 0;
      while (p < dec.length - 2 && segs.length < 15) {
        const h = dec[p];
        if (h > 15) break;
        const l = dec[p + 1];
        segs.push([h, l]);
        p += 2 + l;
      }
      const segStr = segs.map(s => '[' + s[0] + ']l=' + s[1]).join(' ');
      if (segs.length >= 3) console.log('  [' + a.length + 'B] 解码 ' + dec.length + 'B:', segStr);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
