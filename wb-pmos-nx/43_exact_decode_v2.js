/**
 * 43_exact_decode_v2.js
 *
 * 基于码表（code table）的精确 huffman 解码：
 *   - 构建 idx → {key, val} 码表（与 numarrEncrypt 相同）
 *   - 穷举最后字节的有效位数（two）
 *   - 贪心最长前缀匹配解码
 *   - 重编码验证
 */
require('module-alias')('.');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

// === 复制 numarrEncrypt 的树/码表（必须完全一致） ===
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
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else {
    arr[tree.idx] = config;
  }
  return arr;
}
const CODES = getEncryptConfig(getTree());
// 构建 idx → bit 串
const codeBits = CODES.map(c => c.key.toString(2).padStart(c.val, '0'));
console.log('码表构建完成，idx0:', codeBits[0], 'idx255:', codeBits[255]);

// 贪心最长前缀解码
function decodeWithTwo(numenc, two) {
  let bits = '';
  for (let i = 0; i < numenc.length; i++) {
    const b = numenc[i];
    if (i === numenc.length - 1) {
      bits += (b >> two).toString(2).padStart(8 - two, '0');
    } else {
      bits += b.toString(2).padStart(8, '0');
    }
  }
  const out = [];
  let pos = 0;
  while (pos < bits.length) {
    let matched = null;
    for (let idx = 0; idx < 256; idx++) {
      const cb = codeBits[idx];
      if (cb && bits.startsWith(cb, pos) && cb.length > 0) {
        if (!matched || cb.length > matched.len) matched = { idx, len: cb.length };
      }
    }
    if (!matched) break;
    out.push(matched.idx);
    pos += matched.len;
  }
  return { out, consumed: pos };
}

const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
const realInput = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288).args[0].d;
const numenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);

console.log('\n穷举 two=0..7:');
for (let two = 0; two <= 7; two++) {
  const { out, consumed } = decodeWithTwo(numenc, two);
  const re = numarrEncrypt([...out]);
  const match = re.length === numenc.length && re.every((b, i) => b === numenc[i]);
  console.log('two=' + two + ' 解码=' + out.length + 'B consumed=' + consumed + 'bit 匹配:', match ? 'YES ✓' : 'no');
  if (match) {
    console.log('\n★★★ 精确 basearr len:', out.length);
    console.log('头部 40:', out.slice(0, 40).join(','));
    let seg = '';
    console.log('ASCII 段:');
    for (let i = 0; i < out.length; i++) {
      const b = out[i];
      if (b >= 32 && b <= 126) seg += String.fromCharCode(b);
      else { if (seg.length >= 3) console.log('  @' + (i - seg.length) + ': "' + seg + '"'); seg = ''; }
    }
    if (seg.length >= 3) console.log('  @' + (out.length - seg.length) + ': "' + seg + '"');
    fs.writeFileSync(path.join(OUT, 'basearr_exact.json'), JSON.stringify({ basearr: out, numenc, keys2, challenge: inner.challenge }));
    console.log('已保存 captures/basearr_exact.json');
    break;
  }
}
