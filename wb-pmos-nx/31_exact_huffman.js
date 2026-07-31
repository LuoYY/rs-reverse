/**
 * 31_exact_huffman.js
 *
 * 精确 huffman 解码：完整解码 bit 流，然后裁剪末尾字节，重编码验证 == 原 numenc
 */
require('module-alias')('.');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
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

function decodeAll(numenc) {
  // 完整解码所有 bit，返回所有可能的码字序列（含重叠路径）
  const tree = getTree();
  let bits = '';
  for (const b of numenc) bits += b.toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (!node) break;
    if (node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}

// 读取数据
const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
const realInput = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288).args[0].d;
const numenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);

console.log('numenc len:', numenc.length);
const fullDecode = decodeAll(numenc);
console.log('完整解码:', fullDecode.length, 'B');

// 从末尾裁剪 0-6 字节，重编码验证
let best = null;
for (let cut = 0; cut <= 8; cut++) {
  const candidate = fullDecode.slice(0, fullDecode.length - cut);
  const reEnc = numarrEncrypt([...candidate]);
  const match = reEnc.length === numenc.length && reEnc.every((b, i) => b === numenc[i]);
  console.log('裁剪', cut, '→', candidate.length, 'B 匹配:', match ? 'YES ✓' : 'no');
  if (match) { best = candidate; break; }
}

if (best) {
  console.log('\n★★★ 精确 basearr len:', best.length);
  console.log('头部 30:', best.slice(0, 30).join(','));
  // ASCII 段
  let seg = '';
  console.log('ASCII 段:');
  for (let i = 0; i < best.length; i++) {
    const b = best[i];
    if (b >= 32 && b <= 126) seg += String.fromCharCode(b);
    else { if (seg.length >= 3) console.log('  @' + (i - seg.length) + ': "' + seg + '"'); seg = ''; }
  }
  if (seg.length >= 3) console.log('  @' + (best.length - seg.length) + ': "' + seg + '"');
  fs.writeFileSync(path.join(OUT, 'basearr_exact.json'), JSON.stringify({ basearr: best, numenc, keys2, challenge: inner.challenge }));
  console.log('已保存 captures/basearr_exact.json');
} else {
  console.log('未找到精确匹配');
}
