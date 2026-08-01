/**
 * 258_double_huffman.js
 *
 * 验证 nx basearr 是否双重编码：
 * 317B → numarrDecrypt → 330B → numarrEncrypt(330B) == 317B？
 * 若 YES → 330B 是真实 numarrJoin basearr
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
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

  const d = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_browser_plain.json')));
  const ba = d.basearr; // 317B
  console.log('basearr:', ba.length, 'B');

  const d2 = numarrDecrypt(ba);
  console.log('numarrDecrypt:', d2.length, 'B');

  // round-trip：numarrEncrypt(d2) == ba？
  const back = numarrEncrypt([...d2]);
  console.log('numarrEncrypt(d2):', back.length, 'B');
  console.log('round-trip:', back.length === ba.length && back.every((v, i) => v === ba[i]) ? '★★★ YES' : 'NO');

  // 如果 YES → d2 是真实 basearr，分析段结构
  if (back.length === ba.length && back.every((v, i) => v === ba[i])) {
    console.log('\n★★★ d2 是合法 huffman 编码! 解析段结构:');
    let p = 0, segs = [];
    while (p < d2.length - 2 && segs.length < 40) {
      const h = d2[p];
      if (h > 15) break;
      const l = d2[p + 1];
      segs.push([h, l, p]);
      p += 2 + l;
    }
    console.log('段:', segs.map(s => '[' + s[0] + ']l' + s[1] + '@' + s[2]).join(' '));
    console.log('d2 完整:', JSON.stringify(d2));
    fs.writeFileSync(path.join(OUT, 'basearr_browser_inner.json'), JSON.stringify({ basearr: d2 }));
  } else {
    // 尝试截断 bit
    const bits = ba.map(b => b.toString(2).padStart(8, '0')).join('');
    for (let cut = 0; cut <= 16; cut++) {
      const dec = [];
      const tree = getTree();
      let node = tree;
      for (let i = 0; i < bits.length - cut; i++) {
        node = bits[i] === '0' ? node.first : node.second;
        if (node && node.idx !== undefined) { dec.push(node.idx); node = tree; }
      }
      const enc = numarrEncrypt([...dec]);
      if (enc.length === ba.length && enc.every((v, i) => v === ba[i])) {
        console.log('★★★ 截断 ' + cut + ' bit round-trip YES! dec=' + dec.length + 'B');
        console.log('dec 前 40:', dec.slice(0, 40).join(','));
        break;
      }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
