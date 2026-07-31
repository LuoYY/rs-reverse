/**
 * 41_segment_decode.js
 *
 * 精确分段 huffman 解码：
 *   前 287 字节完整解码（已验证重编码一致）+ 最后字节逐位匹配
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

function decodeBits(bits) {
  const tree = getTree();
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (!node) return { out, stopAt: i };
    if (node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return { out, stopAt: bits.length };
}

const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
const realInput = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288).args[0].d;
const numenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);

// 前 287 字节 + 最后字节
const pre = numenc.slice(0, 287);
const last = numenc[287];

// 前 287 字节 bit 流
let preBits = '';
for (const b of pre) preBits += b.toString(2).padStart(8, '0');
const { out: S_pre } = decodeBits(preBits);
console.log('前287字节解码:', S_pre.length, 'B');

// 最后字节 0x0d = 00001101
const lastBits = last.toString(2).padStart(8, '0');
console.log('最后字节 bit:', lastBits);

// 尝试所有有效位截断（从最后字节取前 k 位，k=0..8）
for (let k = 0; k <= 8; k++) {
  const tailBits = lastBits.substring(0, k);
  const fullBits = preBits + tailBits;
  const { out: S } = decodeBits(fullBits);
  const re = numarrEncrypt([...S]);
  const match = re.length === numenc.length && re.every((b, i) => b === numenc[i]);
  console.log('取最后字节前' + k + '位 → 解码' + S.length + 'B 重编码匹配:', match ? 'YES ✓' : 'no');
  if (match) {
    console.log('\n★★★ 精确 basearr len:', S.length);
    console.log('头部 30:', S.slice(0, 30).join(','));
    let seg = '';
    console.log('ASCII 段:');
    for (let i = 0; i < S.length; i++) {
      const b = S[i];
      if (b >= 32 && b <= 126) seg += String.fromCharCode(b);
      else { if (seg.length >= 3) console.log('  @' + (i - seg.length) + ': "' + seg + '"'); seg = ''; }
    }
    if (seg.length >= 3) console.log('  @' + (S.length - seg.length) + ': "' + seg + '"');
    fs.writeFileSync(path.join(OUT, 'basearr_exact.json'), JSON.stringify({ basearr: S, numenc, keys2, challenge: inner.challenge }));
    console.log('已保存 captures/basearr_exact.json');
    break;
  }
}
