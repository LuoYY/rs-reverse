/**
 * 25_decode_basearr.js
 *
 * 从内层加密输入（288B）还原 basearr 明文：
 *   numenc(basearr) = 288B XOR keys2[0..15]（前 16 字节）
 *   basearr = huffman 解码(numenc)
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

// === 复制管线 numarrEncrypt 的树/码表逻辑 ===
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

function huffmanDecode(numenc) {
  const tree = getTree();
  let bits = '';
  for (const b of numenc) bits += b.toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  let matched = 0;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (!node) break;  // padding 后无有效路径
    if (node.idx !== undefined) {
      out.push(node.idx);
      node = tree;
      matched = i + 1;
    }
  }
  return { out, consumedBits: matched };
}

function main() {
  // 读取最新 inner 捕获
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  console.log('文件:', f);

  // 找 [185] 内层输入（len 288）
  const enc = d.log.find(e => e.idx === 185 && e.args[0] && e.args[0].t === 'arr' && e.args[0].len === 288);
  if (!enc) { console.log('未找到 288B 内层输入'); return; }
  const input288 = enc.args[0].d;
  // keys2
  const xorCall = d.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48);
  const keys2 = xorCall.args[1].d;
  console.log('keys2:', keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // numenc = input288 XOR keys2 前 16 字节
  const numenc = input288.map((b, i) => i < 16 ? b ^ keys2[i] : b);
  console.log('numenc 前 24:', numenc.slice(0, 24).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // huffman 解码
  const { out, consumedBits } = huffmanDecode(numenc);
  console.log('\n=== 解码结果 ===');
  console.log('basearr len:', out.length, 'consumedBits:', consumedBits);
  console.log('头部 40:', out.slice(0, 40).join(','));
  console.log('hex 前 60:', out.slice(0, 60).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 结构分析
  console.log('\n=== basearr 结构分析 ===');
  if (out[0] === 3) {
    // numarrJoin(3, ...) 外层
    console.log('外层头 = 3（numarrJoin）');
    // 找下一段：段类型 1（固定值段）
    let pos = 1;
    console.log('out[1]:', out[1], 'out[2..]:', out.slice(2, 10).join(','));
  } else {
    console.log('外层头 =', out[0], '（非 3，可能被截断或结构不同）');
  }

  // 保存
  fs.writeFileSync(path.join(OUT, 'basearr_decoded.json'), JSON.stringify({
    capturedAt: d.capturedAt, challenge: d.challenge, basearr: out, keys2,
    numenc, input288,
  }, null, 2));
  console.log('\n已保存 captures/basearr_decoded.json');
}

main();
