/**
 * 249_huffman_unit_test.js
 *
 * huffman round-trip 单元测试：管线 numarrEncrypt vs 手写解码
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

  // 测试数组
  const tests = [
    [3, 5, 1, 2, 100, 200, 255, 0, 48],
    [3, 73, 1, 0, 33, 128, 159, 173],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [0, 0, 0, 0, 255, 255, 255, 128, 64, 32, 16, 8, 4, 2, 1],
  ];

  for (const t of tests) {
    const enc = numarrEncrypt([...t]);
    const dec = numarrDecrypt(enc);
    // round-trip：解码后重新编码，对比
    const enc2 = numarrEncrypt([...dec]);
    const rt = enc2.length === enc.length && enc2.every((v, i) => v === enc[i]);
    console.log('输入', t.length, 'B → 编码', enc.length, 'B → 解码', dec.length, 'B round-trip:', rt ? 'YES' : 'NO');
    if (!rt) {
      console.log('  原始:', JSON.stringify(t));
      console.log('  解码:', JSON.stringify(dec));
      console.log('  enc:', enc.join(','));
      console.log('  enc2:', enc2.join(','));
      break;
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
