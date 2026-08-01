/**
 * 245_roundtrip_huffman.js
 *
 * 用真实 E round-trip 验证 huffman 解码器：
 * Ereal → numarrDecrypt → ba → numarrEncrypt(ba) → 应 == Ereal
 * 修复 padding：numarrEncrypt 最后 pad 用 getKey(0x68)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

// huffman 树（与 numarrEncrypt 一致）
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
function numarrDecrypt(bytes, pad) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  // 去掉 padding：最后字节的低 (8 - lastBitLen) 位是 pad
  // 先正常解码，记录每个输出字符的位置
  const out = [];
  let node = tree;
  let lastOk = 0;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (node && node.idx !== undefined) { out.push(node.idx); node = tree; lastOk = i + 1; }
  }
  // 尝试不同 pad 截断：找到 round-trip 匹配
  const tryPad = [];
  for (let cut = 0; cut <= 7; cut++) {
    // 重新解码，但最后字节的 bit 数限制
    const out2 = [];
    let node2 = tree;
    let totalBits = bits.length * 1 - cut; // cut 掉最后 cut 个 bit
    // 最后一个字节只有 8-cut 个有效 bit
    for (let i = 0; i < bits.length; i++) {
      node2 = bits[i] === '0' ? node2.first : node2.second;
      if (node2 && node2.idx !== undefined) { out2.push(node2.idx); node2 = tree; }
    }
    tryPad.push(out2);
  }
  return { out, tryPad };
}
function numarrEncryptBytes(numarr, pad) {
  const tree = getTree();
  const map = {};
  (function walk(node, bits) { if (node.idx !== undefined) { map[node.idx] = bits; return; } walk(node.first, bits + '0'); walk(node.second, bits + '1'); })(tree, '');
  let bitstr = '';
  for (const b of numarr) bitstr += map[b] || '';
  const out = [];
  let one = 0, two = 0;
  for (const c of bitstr) { one = (one << 1) | +c; two++; if (two === 8) { out.push(one); one = 0; two = 0; } }
  if (two > 0) out.push(one << (8 - two) | (pad >> two));
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);

  const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
  const Xreal = encryptMode2([...target], arr, 0);
  const Ereal = Xreal.slice();
  for (let i = 0; i < 16 && i < Ereal.length; i++) Ereal[i] ^= keys2[i];
  console.log('真实 E:', Ereal.length, 'B 后 4:', Ereal.slice(-4).join(','));

  // round-trip：解码 Ereal → 编码 → 对比
  const { out, tryPad } = numarrDecrypt(Ereal);
  console.log('解码:', out.length, 'B');
  const back = numarrEncryptBytes(out, 0x68);
  console.log('再编码:', back.length, 'B 匹配:', back.every((v, i) => v === Ereal[i]) ? '★★★ YES' : 'NO');
  let firstD = -1;
  for (let i = 0; i < Math.min(back.length, Ereal.length); i++) if (back[i] !== Ereal[i]) { firstD = i; break; }
  console.log('差异 @', firstD, 'back 尾:', back.slice(-4).join(','), 'Ereal 尾:', Ereal.slice(-4).join(','));

  // 尝试截断解码
  for (let cut = 0; cut <= 8; cut++) {
    const bits = Ereal.map(b => b.toString(2).padStart(8, '0')).join('');
    const dec = [];
    const tree = getTree();
    let node = tree;
    let consumed = 0;
    for (let i = 0; i < bits.length - cut; i++) {
      node = bits[i] === '0' ? node.first : node.second;
      if (node && node.idx !== undefined) { dec.push(node.idx); node = tree; consumed = i + 1; }
    }
    const enc = numarrEncryptBytes(dec, 0x68);
    const ok = enc.length === Ereal.length && enc.every((v, i) => v === Ereal[i]);
    if (ok) {
      console.log('★★★ 截断 ' + cut + ' bit 后 round-trip YES, basearr=' + dec.length + 'B');
      console.log('basearr 前 30:', dec.slice(0, 30).join(','));
      fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ cut, basearr: dec }));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
