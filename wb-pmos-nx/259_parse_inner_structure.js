/**
 * 259_parse_inner_structure.js
 *
 * 完整解析 330B（numarrDecrypt(317B)）的段结构，判断是否 numarrJoin
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
  const d2 = numarrDecrypt(ba);
  console.log('330B 完整:', JSON.stringify(d2));

  // 解析 numarrJoin：从每个可能起点尝试
  console.log('\n=== 从各起点解析 numarrJoin ===');
  for (let start = 0; start <= 4; start++) {
    const p = start;
    const segs = [];
    let ok = true;
    let q = p;
    while (q < d2.length - 1 && segs.length < 30) {
      const h = d2[q];
      if (h > 15) { ok = false; break; }
      const l = d2[q + 1];
      if (q + 2 + l > d2.length) { ok = false; break; }
      segs.push([h, l]);
      q += 2 + l;
    }
    console.log('起点 ' + start + ': ' + (ok ? segs.map(s => '[' + s[0] + ']l' + s[1]).join(' ') : '不连贯 @' + q + ' h=' + d2[q]));
  }

  // 0 的位置
  const zeros = [];
  for (let i = 0; i < d2.length; i++) if (d2[i] === 0) zeros.push(i);
  console.log('\n0 的位置:', zeros.join(','));
  console.log('0 数量:', zeros.length);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
