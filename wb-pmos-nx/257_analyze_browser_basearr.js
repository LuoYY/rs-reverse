/**
 * 257_analyze_browser_basearr.js
 *
 * 分析浏览器 basearr（317B）结构：段头扫描 / 0分布 / ASCII / 与 xj 对比
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
  const d = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_browser_plain.json')));
  const ba = d.basearr;
  console.log('浏览器 basearr:', ba.length, 'B 首 16:', ba.slice(0, 16).join(','));

  // 1. 再解码（可能是 numarrEncrypt 嵌套）
  const d2 = numarrDecrypt(ba);
  console.log('\n再解码:', d2.length, 'B 首 16:', d2.slice(0, 16).join(','));
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
    console.log('再解码前 60:', d2.slice(0, 60).join(','));
  }

  // 2. 段头扫描（h<=15 的 [h][len]）
  console.log('\n=== [h][len] 段头（h<=15）===');
  for (let i = 0; i < ba.length - 1; i++) {
    const h = ba[i], l = ba[i + 1];
    if (h <= 15 && l < 200 && i + 2 + l <= ba.length) {
      console.log('  @' + i + ': [' + h + '] len=' + l + ' 数据前 8:', ba.slice(i + 2, i + 10).join(','));
    }
  }

  // 3. ASCII 段
  console.log('\n=== ASCII 段 ===');
  let cur = '', start = -1;
  for (let i = 0; i <= ba.length; i++) {
    const v = i < ba.length ? ba[i] : -1;
    if (v >= 32 && v <= 126) { if (cur === '') start = i; cur += String.fromCharCode(v); }
    else { if (cur.length >= 4) console.log('  @' + start + ': [' + cur + ']'); cur = ''; }
  }

  // 4. keys2 出现位置
  console.log('\n=== keys2 搜索 ===');
  const bk2 = [139, 205, 229, 211, 162, 17, 247, 43];
  for (let i = 0; i + 8 <= ba.length; i++) {
    if (ba.slice(i, i + 8).every((v, j) => v === bk2[j])) console.log('  keys2 前缀 @' + i);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
