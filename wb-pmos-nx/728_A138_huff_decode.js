/**
 * 728_A138_huff_decode.js
 * 测试 be 段（cookie 解密产物）是否 = huffman 加密的 base（179 开头）
 * 用 nx huffman 树解码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');

(async () => {
  const d = JSON.parse(fs.readFileSync('/tmp/nx_browser_base_v2.json', 'utf8'));
  const be = d.be;
  console.log('be len:', be.length, 'be[0-8]:', be.slice(0, 8).join(','));

  // nx huffman 树（频率：1..254 各1, 255=6, 0=45）
  function getTree() {
    let arr = [];
    for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
    arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
    function parse(item) {
      for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
      arr.push(item);
    }
    while (arr.length > 1) {
      const [one, two] = arr.slice(0, 2);
      arr = arr.slice(2);
      parse({ total: one.total + two.total, first: one, second: two });
    }
    return arr[0];
  }
  const tree = getTree();
  // 解码：逐 bit 遍历树
  function huffDecode(bytes) {
    const out = [];
    let node = tree;
    for (let bi = 0; bi < bytes.length; bi++) {
      for (let bit = 7; bit >= 0; bit--) {
        const b = (bytes[bi] >> bit) & 1;
        node = b ? node.second : node.first;
        if (node.idx !== undefined) {
          out.push(node.idx);
          node = tree;
        }
      }
    }
    return out;
  }
  const decoded = huffDecode(be);
  console.log('huff 解码 len:', decoded.length);
  console.log('decoded[0-31]:', decoded.slice(0, 32).join(','));
  console.log('decoded[22-40]:', decoded.slice(22, 41).join(','));
  console.log('decoded 尾 8:', decoded.slice(-8).join(','));

  // 对比期望 base 特征：179 开头, 0-255 均匀
  const ascii = decoded.filter(x => x >= 0x30 && x <= 0x3c).length;
  console.log('decoded 0x30-0x3C 比例:', ascii, '/', decoded.length);
  fs.writeFileSync('/tmp/nx_browser_base_huff.json', JSON.stringify({ base: decoded, be }));
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
