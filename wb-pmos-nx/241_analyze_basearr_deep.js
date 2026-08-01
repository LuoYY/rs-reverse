/**
 * 241_analyze_basearr_deep.js
 *
 * 深入分析 basearr 明文（317B/154B）：
 * 1. 再 huffman 解码（可能是 numarrEncrypt 嵌套）
 * 2. 结构扫描（找段头模式）
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
  for (const f of ['basearr_browser_plain.json', 'basearr_jsdom_xor16.json']) {
    if (!fs.existsSync(path.join(OUT, f))) continue;
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
    const ba = d.basearr;
    console.log('\n=== ' + f + ' basearr ' + ba.length + 'B ===');
    console.log('首 16:', ba.slice(0, 16).join(','));

    // 1. 再 huffman 解码
    const d2 = numarrDecrypt(ba);
    console.log('再 huffman 解码:', d2.length, 'B 首 16:', d2.slice(0, 16).join(','));

    // 2. 段结构扫描（首字节 3/2/1）
    if (d2.length > 50) {
      let p = 0, segs = [];
      while (p < d2.length - 2 && segs.length < 30) {
        const h = d2[p];
        if (h > 15) break;
        const l = d2[p + 1];
        segs.push([h, l, p]);
        p += 2 + l;
      }
      console.log('再解码段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
    }

    // 3. 统计 0 的位置分布
    const zeros = [];
    for (let i = 0; i < ba.length; i++) if (ba[i] === 0) zeros.push(i);
    console.log('0 的位置:', zeros.join(','));
    console.log('0 数量:', zeros.length, '/', ba.length);

    // 4. ASCII 段
    let cur = '';
    for (let i = 0; i < ba.length; i++) {
      if (ba[i] >= 32 && ba[i] <= 126) cur += String.fromCharCode(ba[i]);
      else { if (cur.length >= 4) console.log('ASCII 段 @' + (i - cur.length) + ': [' + cur + ']'); cur = ''; }
    }
    if (cur.length >= 4) console.log('ASCII 段: [' + cur + ']');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
