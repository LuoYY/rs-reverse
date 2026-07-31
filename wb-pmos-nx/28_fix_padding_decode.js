/**
 * 28_fix_padding_decode.js
 *
 * 精确 huffman 解码（处理 padding）：
 *   numenc 最后一个字节 = 有效数据位 << (8-two) | padding 位
 *   迭代 two=0..7，解码 → 重编码验证 == 原 numenc
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

function huffmanDecode(numenc, paddingBits) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < numenc.length; i++) {
    const b = numenc[i];
    if (i === numenc.length - 1 && paddingBits > 0) {
      // 最后字节只取前 (8-paddingBits) 位有效数据
      bits += (b >> paddingBits).toString(2).padStart(8 - paddingBits, '0');
    } else {
      bits += b.toString(2).padStart(8, '0');
    }
  }
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

// 尝试不同 padding 位数
console.log('numenc len:', numenc.length);
for (let p = 0; p <= 8; p++) {
  const decoded = huffmanDecode(numenc, p);
  const reEnc = numarrEncrypt([...decoded]);
  const match = reEnc.length === numenc.length && reEnc.every((b, i) => b === numenc[i]);
  console.log('padding=' + p + ' 解码=' + decoded.length + 'B 重编码匹配: ' + (match ? 'YES ✓' : 'no'));
  if (match) {
    console.log('\n★★★ 精确 basearr 解码成功! len=' + decoded.length);
    console.log('头部 24:', decoded.slice(0, 24).join(','));
    console.log('hex 前 40:', decoded.slice(0, 40).map(b => b.toString(16).padStart(2, '0')).join(' '));
    // ASCII
    let seg = '';
    console.log('\nASCII 段:');
    for (let i = 0; i < decoded.length; i++) {
      const b = decoded[i];
      if (b >= 32 && b <= 126) seg += String.fromCharCode(b);
      else { if (seg.length >= 3) console.log('  @' + (i - seg.length) + ': "' + seg + '"'); seg = ''; }
    }
    if (seg.length >= 3) console.log('  @' + (decoded.length - seg.length) + ': "' + seg + '"');
    fs.writeFileSync(path.join(OUT, 'basearr_exact.json'), JSON.stringify({ basearr: decoded, numenc, keys2, challenge: inner.challenge }));
    console.log('\n已保存 captures/basearr_exact.json');
    break;
  }
}
